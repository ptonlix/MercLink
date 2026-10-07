import { createPublicId } from "../../shared/id";
import { canReadSchema } from "../../domain/catalog/access";
import type { Actor } from "../../shared/actor";
import { fieldSnapshot, planFieldChange, type FieldDefinition } from "../../domain/catalog/fields";
import { parseFieldChangeBody, parseFieldCreateBody } from "../../domain/catalog/parse";
import { catalogFail, catalogOk, type CatalogResult } from "../../domain/catalog/result";
import {
  conflictFor,
  findCatalog,
  isUniqueViolation,
  loadFields,
  lockCatalog,
  lockProducts,
  ownedCatalog,
  readFields,
  toField,
  type Db,
  type FieldRow,
  type Sql,
  type Tx,
} from "./db";
import { fieldRecord, type FieldRecord } from "./records";

export type FieldChangeApplied = {
  applied: true;
  revision: number;
  affectedCount: number;
  field: FieldDefinition | null;
};

export type FieldChangePreview = {
  applied: false;
  breaking: true;
  affectedCount: number;
  affected: readonly { productId: string; reason: string }[];
};

export async function listFields(
  db: Db,
  merchantId: string,
  catalogId: string,
): Promise<CatalogResult<FieldRecord[]>> {
  const catalog = ownedCatalog(await findCatalog(db, catalogId), merchantId);
  if (catalog === undefined) {
    return catalogFail("not_found", "没有找到目录。");
  }
  const rows = await loadFields(db, catalogId);
  return catalogOk(rows.map(fieldRecord));
}

export async function readSchema(
  db: Db,
  catalogId: string,
  actor: Actor | undefined,
): Promise<
  CatalogResult<{
    catalogId: string;
    currency: string;
    schemaRevision: number;
    fields: FieldRecord[];
  }>
> {
  const catalog = await findCatalog(db, catalogId);
  if (
    catalog === undefined ||
    catalog.deleted_at !== null ||
    !canReadSchema(actor, catalog.merchant_id)
  ) {
    return catalogFail("not_found", "没有找到目录。");
  }
  const fields = await loadFields(db, catalogId);
  return catalogOk({
    catalogId: catalog.id,
    currency: catalog.currency,
    schemaRevision: catalog.schema_revision,
    fields: fields.map(fieldRecord),
  });
}

export async function addField(
  db: Sql,
  merchantId: string,
  catalogId: string,
  input: unknown,
): Promise<CatalogResult<FieldChangeApplied | FieldChangePreview>> {
  const parsed = parseFieldCreateBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  return applyChange(db, merchantId, catalogId, parsed.value.change, parsed.value.confirm);
}

export async function changeFields(
  db: Sql,
  merchantId: string,
  catalogId: string,
  input: unknown,
): Promise<CatalogResult<FieldChangeApplied | FieldChangePreview>> {
  const parsed = parseFieldChangeBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  return applyChange(db, merchantId, catalogId, parsed.value.change, parsed.value.confirm);
}

async function applyChange(
  db: Sql,
  merchantId: string,
  catalogId: string,
  change: Parameters<typeof planFieldChange>[2],
  confirm: boolean,
): Promise<CatalogResult<FieldChangeApplied | FieldChangePreview>> {
  try {
    return await db.begin(async (tx) => {
      const catalog = ownedCatalog(await lockCatalog(tx, catalogId), merchantId);
      if (catalog === undefined) {
        return catalogFail("not_found", "没有找到目录。");
      }
      const fieldRows = await loadFields(tx, catalogId);
      const fields = fieldRows.map(toField);
      const productRows = await lockProducts(tx, catalogId);
      const products = productRows.map((row) => ({
        id: row.id,
        status: row.status === "on" ? ("on" as const) : ("off" as const),
        deleted: row.deleted_at !== null,
        fields: readFields(row.fields),
      }));
      const plan = planFieldChange(fields, products, change);
      if (!plan.ok) {
        return plan;
      }
      const unpublished = plan.value.effects.filter((effect) => effect.unpublish);
      if (plan.value.breaking && !confirm) {
        return catalogOk({
          applied: false,
          breaking: true,
          affectedCount: unpublished.length,
          affected: unpublished.flatMap((effect) =>
            effect.reason === null ? [] : [{ productId: effect.productId, reason: effect.reason }],
          ),
        });
      }
      const revision = catalog.schema_revision + 1;
      await writeFields(tx, catalogId, fieldRows, plan.value.nextFields);
      for (const effect of plan.value.effects) {
        if (!effect.fieldsChanged && !effect.unpublish) {
          continue;
        }
        await tx`
          UPDATE products
          SET fields = ${tx.json(effect.nextFields)},
              status = ${effect.nextStatus},
              schema_revision = ${revision},
              updated_at = now()
          WHERE id = ${effect.productId}
        `;
      }
      const before = fields.find((field) => field.key === change.key) ?? null;
      const after = plan.value.nextFields.find((field) => field.key === change.key) ?? null;
      await tx`
        INSERT INTO schema_revisions (id, catalog_id, revision, op, before, after, affected_count)
        VALUES (
          ${createPublicId("revision")},
          ${catalogId},
          ${revision},
          ${change.op},
          ${before === null ? null : tx.json(fieldSnapshot(before))},
          ${after === null ? null : tx.json(fieldSnapshot(after))},
          ${plan.value.affectedCount}
        )
      `;
      await tx`
        UPDATE catalogs
        SET schema_revision = ${revision}, updated_at = now()
        WHERE id = ${catalogId}
      `;
      return catalogOk({
        applied: true,
        revision,
        affectedCount: plan.value.affectedCount,
        field: after,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}

async function writeFields(
  tx: Tx,
  catalogId: string,
  current: readonly FieldRow[],
  next: readonly FieldDefinition[],
): Promise<void> {
  const byKey = new Map(current.map((row) => [row.key, row]));
  for (const field of next) {
    const existing = byKey.get(field.key);
    const choices = field.choices.length === 0 ? null : tx.json([...field.choices]);
    if (existing === undefined) {
      await tx`
        INSERT INTO product_fields (id, catalog_id, key, label, type, required, choices, status)
        VALUES (
          ${createPublicId("field")},
          ${catalogId},
          ${field.key},
          ${field.label},
          ${field.type},
          ${field.required},
          ${choices},
          ${field.status}
        )
      `;
      continue;
    }
    await tx`
      UPDATE product_fields
      SET label = ${field.label},
          type = ${field.type},
          required = ${field.required},
          choices = ${choices},
          status = ${field.status},
          retired_at = ${field.status === "retired" ? tx`now()` : null},
          updated_at = now()
      WHERE id = ${existing.id}
    `;
  }
}
