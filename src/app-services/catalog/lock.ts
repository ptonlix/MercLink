import type postgres from "postgres";
import type {
  LockSellableInput,
  LockSellableResult,
  RestoreSellableInput,
  RestoreSellableResult,
} from "../../shared/seams/sellable-variants";
import { publicAttrs } from "../../domain/catalog/attributes";
import type { Attrs } from "../../domain/catalog/fields";
import {
  selectLockTarget,
  selectRestoreTarget,
  type LockCandidate,
} from "../../domain/catalog/lock";
import { loadFields, readAttrs, readOptionValues, toField } from "./db";

type LockRow = {
  variant_id: string;
  product_id: string;
  catalog_id: string;
  price: number;
  stock: number | null;
  sku: string | null;
  option_values: unknown;
  variant_status: string;
  variant_deleted_at: Date | null;
  title: string;
  product_status: string;
  product_deleted_at: Date | null;
  attrs: unknown;
  currency: string;
  schema_revision: number;
  catalog_deleted_at: Date | null;
};

// The order slice passes its open transaction. The row lock must be taken there.
export async function lockSellable(input: LockSellableInput): Promise<LockSellableResult> {
  const tx = asPostgresTx(input.tx);
  const variantId = input.variantId ?? null;
  const productId = input.productId ?? null;
  const rows = await tx<LockRow[]>`
    SELECT
      v.id AS variant_id,
      v.product_id,
      v.catalog_id,
      v.price,
      v.stock,
      v.sku,
      v.option_values,
      v.status AS variant_status,
      v.deleted_at AS variant_deleted_at,
      p.title,
      p.status AS product_status,
      p.deleted_at AS product_deleted_at,
      p.attrs,
      c.currency,
      c.schema_revision,
      c.deleted_at AS catalog_deleted_at
    FROM variants v
    JOIN products p ON p.id = v.product_id
    JOIN catalogs c ON c.id = v.catalog_id
    WHERE (
      (${variantId}::text IS NOT NULL AND v.id = ${variantId})
      OR (${variantId}::text IS NULL AND ${productId}::text IS NOT NULL AND v.product_id = ${productId})
    )
    FOR UPDATE OF v
  `;
  const choice = selectLockTarget(await Promise.all(rows.map((row) => candidate(tx, row))), {
    ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
    ...(input.productId !== undefined ? { productId: input.productId } : {}),
    qty: input.qty,
  });
  if (!choice.ok) {
    return choice;
  }
  if (choice.value.nextStock !== null) {
    await tx`
      UPDATE variants
      SET stock = ${choice.value.nextStock}, updated_at = now()
      WHERE id = ${choice.value.variantId}
    `;
  }
  const line = choice.value.line;
  return {
    ok: true,
    line: {
      catalogId: line.catalogId,
      productId: line.productId,
      variantId: line.variantId,
      title: line.title,
      currency: line.currency,
      unitPrice: choice.value.unitPrice,
      stock: line.stock,
      sku: line.sku,
      optionValues: line.optionValues,
      fields: line.attrs,
      schemaRevision: line.schemaRevision,
    },
  };
}

export async function restoreSellable(input: RestoreSellableInput): Promise<RestoreSellableResult> {
  const tx = asPostgresTx(input.tx);
  const rows = await tx<{ id: string; stock: number | null }[]>`
    SELECT id, stock
    FROM variants
    WHERE id = ${input.variantId}
    FOR UPDATE
  `;
  const decision = selectRestoreTarget(rows[0]?.stock, input.qty);
  if (!decision.ok) {
    return decision;
  }
  if (decision.value !== null) {
    await tx`
      UPDATE variants
      SET stock = ${decision.value}, updated_at = now()
      WHERE id = ${input.variantId}
    `;
  }
  return { ok: true };
}

async function candidate(tx: postgres.TransactionSql, row: LockRow): Promise<LockCandidate> {
  const fields = (await loadFields(tx, row.catalog_id)).map(toField);
  const attrs: Attrs = publicAttrs(fields, readAttrs(row.attrs));
  return {
    variantId: row.variant_id,
    productId: row.product_id,
    catalogId: row.catalog_id,
    title: row.title,
    currency: row.currency,
    price: row.price,
    stock: row.stock,
    sku: row.sku,
    optionValues: readOptionValues(row.option_values),
    attrs,
    schemaRevision: row.schema_revision,
    variantStatus: row.variant_status === "on" ? "on" : "off",
    productStatus: row.product_status === "on" ? "on" : "off",
    productDeleted: row.product_deleted_at !== null,
    catalogDeleted: row.catalog_deleted_at !== null,
    variantDeleted: row.variant_deleted_at !== null,
  };
}

export function asPostgresTx(tx: object): postgres.TransactionSql {
  if (
    typeof tx === "function" &&
    "unsafe" in tx &&
    typeof tx.unsafe === "function" &&
    "savepoint" in tx &&
    typeof tx.savepoint === "function"
  ) {
    return tx as postgres.TransactionSql;
  }
  throw new TypeError("sellableVariants.lock requires the caller postgres.js transaction");
}
