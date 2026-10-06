import { createPublicId } from "../../shared/id";
import { defaultCatalogPlan, planCatalog } from "../../domain/catalog/catalogs";
import { parseCatalogBody } from "../../domain/catalog/parse";
import { catalogFail, catalogOk, type CatalogResult } from "../../domain/catalog/result";
import {
  conflictFor,
  findCatalog,
  isUniqueViolation,
  ownedCatalog,
  type CatalogRow,
  type Db,
  type Sql,
  type Tx,
} from "./db";
import { catalogRecord, type CatalogRecord } from "./records";

export async function createCatalog(
  db: Sql,
  merchantId: string,
  input: unknown,
): Promise<CatalogResult<CatalogRecord>> {
  const parsed = parseCatalogBody(input);
  if (!parsed.ok) {
    return parsed;
  }
  const planned = planCatalog(parsed.value);
  if (!planned.ok) {
    return planned;
  }
  return insertCatalog(db, merchantId, planned.value.name, planned.value.currency);
}

export async function createDefaultCatalog(tx: Tx, merchantId: string): Promise<string> {
  if (merchantId.trim() === "") {
    throw new TypeError("default catalog requires a merchant id");
  }
  const planned = defaultCatalogPlan();
  const created = await insertCatalog(tx, merchantId, planned.name, planned.currency);
  if (!created.ok) {
    throw new Error(created.message);
  }
  return created.value.id;
}

export async function listCatalogs(db: Db, merchantId: string): Promise<CatalogRecord[]> {
  const rows = await db<CatalogRow[]>`
    SELECT id, merchant_id, name, currency, schema_revision, created_at, updated_at, deleted_at
    FROM catalogs
    WHERE merchant_id = ${merchantId}
      AND deleted_at IS NULL
    ORDER BY created_at, id
  `;
  return rows.map(catalogRecord);
}

export async function readOwnCatalog(
  db: Db,
  merchantId: string,
  catalogId: string,
): Promise<CatalogResult<CatalogRecord>> {
  const row = ownedCatalog(await findCatalog(db, catalogId), merchantId);
  if (row === undefined) {
    return catalogFail("not_found", "没有找到目录。");
  }
  return catalogOk(catalogRecord(row));
}

async function insertCatalog(
  db: Db,
  merchantId: string,
  name: string,
  currency: string,
): Promise<CatalogResult<CatalogRecord>> {
  const id = createPublicId("catalog");
  try {
    const rows = await db<CatalogRow[]>`
      INSERT INTO catalogs (id, merchant_id, name, currency)
      VALUES (${id}, ${merchantId}, ${name}, ${currency})
      RETURNING id, merchant_id, name, currency, schema_revision, created_at, updated_at, deleted_at
    `;
    const row = rows[0];
    if (row === undefined) {
      return catalogFail("conflict", "目录没有创建。");
    }
    return catalogOk(catalogRecord(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return conflictFor(error);
    }
    throw error;
  }
}
