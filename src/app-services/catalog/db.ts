import { getTableName } from "drizzle-orm";
import type postgres from "postgres";
import {
  catalogs,
  productFields,
  productImages,
  productOptions,
  products,
  schemaRevisions,
  variants,
} from "../../db/schema/catalog";
import type { Attrs, AttrValue, FieldDefinition, FieldType } from "../../domain/catalog/fields";
import { catalogFail, type CatalogFailure } from "../../domain/catalog/result";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
export type Db = Sql | Tx;

export const catalogTableNames = [
  getTableName(catalogs),
  getTableName(schemaRevisions),
  getTableName(productFields),
  getTableName(products),
  getTableName(productOptions),
  getTableName(variants),
  getTableName(productImages),
] as const;

export type CatalogRow = {
  id: string;
  merchant_id: string;
  name: string;
  currency: string;
  schema_revision: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type FieldRow = {
  id: string;
  catalog_id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
  status: string;
  retired_at: Date | null;
};

export type ProductRow = {
  id: string;
  catalog_id: string;
  title: string;
  status: string;
  cover: string | null;
  attrs: unknown;
  schema_revision: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type OptionRow = {
  id: string;
  product_id: string;
  key: string;
  label: string;
  position: number;
};

export type VariantRow = {
  id: string;
  catalog_id: string;
  product_id: string;
  sku: string | null;
  option_values: unknown;
  price: number;
  stock: number | null;
  status: string;
  cover: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export function readAttrs(value: unknown): Attrs {
  if (!isRecord(value)) {
    return {};
  }
  const attrs: Record<string, AttrValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "boolean") {
      attrs[key] = item;
    } else if (typeof item === "number" && Number.isFinite(item)) {
      attrs[key] = item;
    }
  }
  return attrs;
}

function readOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function readOptionValues(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const options: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      options[key] = item;
    }
  }
  return options;
}

export function toField(row: FieldRow): FieldDefinition {
  return {
    key: row.key,
    label: row.label,
    type: row.type as FieldType,
    required: row.required,
    options: readOptions(row.options),
    status: row.status === "retired" ? "retired" : "active",
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return readStringProp(error, "code") === "23505";
}

export function conflictFor(error: unknown): CatalogFailure {
  const constraint = readStringProp(error, "constraint_name");
  if (constraint === "variants_catalog_sku_active") {
    return catalogFail("conflict", "SKU 已存在。");
  }
  if (constraint === "variants_product_options_active") {
    return catalogFail("conflict", "这个规格组合已经存在。");
  }
  if (constraint === "product_fields_catalog_key") {
    return catalogFail("conflict", "字段 key 已存在。");
  }
  if (constraint === "product_options_product_key") {
    return catalogFail("conflict", "规格轴已存在。");
  }
  return catalogFail("conflict", "记录冲突。");
}

export async function findCatalog(db: Db, catalogId: string): Promise<CatalogRow | undefined> {
  const rows = await db<CatalogRow[]>`
    SELECT id, merchant_id, name, currency, schema_revision, created_at, updated_at, deleted_at
    FROM catalogs
    WHERE id = ${catalogId}
  `;
  return rows[0];
}

export async function lockCatalog(db: Db, catalogId: string): Promise<CatalogRow | undefined> {
  const rows = await db<CatalogRow[]>`
    SELECT id, merchant_id, name, currency, schema_revision, created_at, updated_at, deleted_at
    FROM catalogs
    WHERE id = ${catalogId}
    FOR UPDATE
  `;
  return rows[0];
}

export function ownedCatalog(
  row: CatalogRow | undefined,
  merchantId: string,
): CatalogRow | undefined {
  if (row === undefined || row.deleted_at !== null || row.merchant_id !== merchantId) {
    return undefined;
  }
  return row;
}

export async function loadFields(db: Db, catalogId: string): Promise<FieldRow[]> {
  return db<FieldRow[]>`
    SELECT id, catalog_id, key, label, type, required, options, status, retired_at
    FROM product_fields
    WHERE catalog_id = ${catalogId}
    ORDER BY created_at, key
  `;
}

export async function lockProducts(db: Db, catalogId: string): Promise<ProductRow[]> {
  return db<ProductRow[]>`
    SELECT id, catalog_id, title, status, cover, attrs, schema_revision, created_at, updated_at, deleted_at
    FROM products
    WHERE catalog_id = ${catalogId}
    ORDER BY id
    FOR UPDATE
  `;
}

export async function findProduct(db: Db, productId: string): Promise<ProductRow | undefined> {
  const rows = await db<ProductRow[]>`
    SELECT id, catalog_id, title, status, cover, attrs, schema_revision, created_at, updated_at, deleted_at
    FROM products
    WHERE id = ${productId}
  `;
  return rows[0];
}

export async function lockProduct(db: Db, productId: string): Promise<ProductRow | undefined> {
  const rows = await db<ProductRow[]>`
    SELECT id, catalog_id, title, status, cover, attrs, schema_revision, created_at, updated_at, deleted_at
    FROM products
    WHERE id = ${productId}
    FOR UPDATE
  `;
  return rows[0];
}

export async function loadOptions(db: Db, productId: string): Promise<OptionRow[]> {
  return db<OptionRow[]>`
    SELECT id, product_id, key, label, position
    FROM product_options
    WHERE product_id = ${productId}
    ORDER BY position, key
  `;
}

export async function loadVariants(db: Db, productId: string): Promise<VariantRow[]> {
  return db<VariantRow[]>`
    SELECT id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
           created_at, updated_at, deleted_at
    FROM variants
    WHERE product_id = ${productId}
    ORDER BY created_at, id
  `;
}

export async function lockVariants(db: Db, productId: string): Promise<VariantRow[]> {
  return db<VariantRow[]>`
    SELECT id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
           created_at, updated_at, deleted_at
    FROM variants
    WHERE product_id = ${productId}
    ORDER BY id
    FOR UPDATE
  `;
}

export async function findVariant(db: Db, variantId: string): Promise<VariantRow | undefined> {
  const rows = await db<VariantRow[]>`
    SELECT id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
           created_at, updated_at, deleted_at
    FROM variants
    WHERE id = ${variantId}
  `;
  return rows[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringProp(error: unknown, key: string): string | undefined {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }
  const value = error[key as keyof typeof error];
  return typeof value === "string" ? value : undefined;
}
