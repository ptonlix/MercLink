import { minorUnits } from "../../shared/money";
import type { PublicProduct, PublicProductPage } from "../../shared/seams/public-products";
import { publicAttrs } from "../../domain/catalog/attributes";
import {
  encodeCursor,
  likePattern,
  parseMerchantProductQuery,
  parsePublicQuery,
  resolveFieldFilters,
  type CompareOp,
  type ResolvedFieldFilter,
} from "../../domain/catalog/query";
import { catalogFail, catalogOk, type CatalogResult } from "../../domain/catalog/result";
import { availability, offerFrom, sellableOnly } from "../../domain/catalog/visibility";
import {
  findCatalog,
  loadFields,
  ownedCatalog,
  readAttrs,
  readOptionValues,
  toField,
  type Db,
  type ProductRow,
  type VariantRow,
} from "./db";
import { productRecord, type ProductRecord } from "./records";

type PublicQueryRow = ProductRow & { currency: string };

export async function listPublicProducts(
  db: Db,
  input: {
    q?: string;
    limit?: string;
    cursor?: string;
    catalogId?: string;
    minPrice?: string;
    maxPrice?: string;
    fieldFilters: readonly { key: string; op: string; raw: string }[];
  },
): Promise<CatalogResult<PublicProductPage>> {
  const parsed = parsePublicQuery(input);
  if (!parsed.ok) {
    return parsed;
  }
  let filters: readonly ResolvedFieldFilter[] = [];
  if (parsed.value.catalogId !== undefined) {
    const catalog = await findCatalog(db, parsed.value.catalogId);
    if (catalog === undefined || catalog.deleted_at !== null) {
      return catalogFail("not_found", "没有找到目录。");
    }
    const fields = (await loadFields(db, catalog.id)).map(toField);
    const resolved = resolveFieldFilters(parsed.value.fieldFilters, fields);
    if (!resolved.ok) {
      return resolved;
    }
    filters = resolved.value;
  }
  const page = await queryVisibleProducts(db, parsed.value, filters);
  return catalogOk(page);
}

export async function getPublicProduct(
  db: Db,
  productId: string,
): Promise<CatalogResult<PublicProduct>> {
  const rows = await db<PublicQueryRow[]>`
    SELECT p.id, p.catalog_id, p.title, p.status, p.cover, p.attrs, p.schema_revision,
           p.created_at, p.updated_at, p.deleted_at, c.currency
    FROM products p
    JOIN catalogs c ON c.id = p.catalog_id
    WHERE p.id = ${productId}
      AND p.deleted_at IS NULL
      AND p.status = 'on'
      AND c.deleted_at IS NULL
  `;
  const row = rows[0];
  if (row === undefined) {
    return catalogFail("not_found", "没有找到商品。");
  }
  const product = await toPublic(db, row);
  if (product === undefined) {
    return catalogFail("not_found", "没有找到商品。");
  }
  return catalogOk(product);
}

export async function listMerchantProducts(
  db: Db,
  merchantId: string,
  catalogId: string,
  input: { status?: string; deleted?: string; limit?: string; cursor?: string },
): Promise<CatalogResult<{ items: ProductRecord[]; nextCursor: string | null }>> {
  const catalog = ownedCatalog(await findCatalog(db, catalogId), merchantId);
  if (catalog === undefined) {
    return catalogFail("not_found", "没有找到目录。");
  }
  const parsed = parseMerchantProductQuery(input);
  if (!parsed.ok) {
    return parsed;
  }
  const params: SqlParam[] = [];
  const add = bind(params);
  const where = [
    `p.catalog_id = ${add(catalogId)}`,
    `c.merchant_id = ${add(merchantId)}`,
    `c.deleted_at IS NULL`,
    parsed.value.deleted ? `p.deleted_at IS NOT NULL` : `p.deleted_at IS NULL`,
  ];
  if (parsed.value.status !== undefined) {
    where.push(`p.status = ${add(parsed.value.status)}`);
  }
  if (parsed.value.cursor !== undefined) {
    where.push(
      `(p.created_at, p.id) < (${add(parsed.value.cursor.createdAt)}::timestamptz, ${add(parsed.value.cursor.id)})`,
    );
  }
  const limit = parsed.value.limit + 1;
  const rows = await db.unsafe<PublicQueryRow[]>(
    `
      SELECT p.id, p.catalog_id, p.title, p.status, p.cover, p.attrs, p.schema_revision,
             p.created_at, p.updated_at, p.deleted_at, c.currency
      FROM products p
      JOIN catalogs c ON c.id = p.catalog_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${add(limit)}
    `,
    params as never[],
  );
  const page = rows.slice(0, parsed.value.limit);
  const items: ProductRecord[] = [];
  for (const row of page) {
    items.push(await assembleMerchant(db, row, parsed.value.deleted));
  }
  const last = page.at(-1);
  const nextCursor =
    rows.length > parsed.value.limit && last !== undefined
      ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
      : null;
  return catalogOk({ items, nextCursor });
}

async function queryVisibleProducts(
  db: Db,
  query: {
    q?: string;
    limit: number;
    cursor?: { createdAt: string; id: string };
    catalogId?: string;
    minPrice?: number;
    maxPrice?: number;
  },
  filters: readonly ResolvedFieldFilter[],
): Promise<PublicProductPage> {
  const params: SqlParam[] = [];
  const add = bind(params);
  const where = [
    `p.status = 'on'`,
    `p.deleted_at IS NULL`,
    `c.deleted_at IS NULL`,
    `EXISTS (
      SELECT 1 FROM variants v
      WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'on'
    )`,
  ];
  if (query.catalogId !== undefined) {
    where.push(`p.catalog_id = ${add(query.catalogId)}`);
  }
  if (query.q !== undefined) {
    const pattern = add(likePattern(query.q));
    where.push(`(
      p.title ILIKE ${pattern} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM product_fields f
        WHERE f.catalog_id = p.catalog_id
          AND f.status = 'active'
          AND f.type = 'text'
          AND COALESCE(p.attrs->>f.key, '') ILIKE ${pattern} ESCAPE '\\'
      )
    )`);
  }
  if (query.minPrice !== undefined) {
    const minPrice = add(query.minPrice);
    where.push(`(
      SELECT MIN(v.price) FROM variants v
      WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'on'
    ) >= ${minPrice}`);
  }
  if (query.maxPrice !== undefined) {
    const maxPrice = add(query.maxPrice);
    where.push(`(
      SELECT MIN(v.price) FROM variants v
      WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'on'
    ) <= ${maxPrice}`);
  }
  for (const filter of filters) {
    where.push(filterClause(filter, add));
  }
  if (query.cursor !== undefined) {
    where.push(
      `(p.created_at, p.id) < (${add(query.cursor.createdAt)}::timestamptz, ${add(query.cursor.id)})`,
    );
  }
  const rows = await db.unsafe<PublicQueryRow[]>(
    `
      SELECT p.id, p.catalog_id, p.title, p.status, p.cover, p.attrs, p.schema_revision,
             p.created_at, p.updated_at, p.deleted_at, c.currency
      FROM products p
      JOIN catalogs c ON c.id = p.catalog_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${add(query.limit + 1)}
    `,
    params as never[],
  );
  const page = rows.slice(0, query.limit);
  const items: PublicProduct[] = [];
  for (const row of page) {
    const product = await toPublic(db, row);
    if (product !== undefined) {
      items.push(product);
    }
  }
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > query.limit && last !== undefined
        ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
        : null,
  };
}

async function toPublic(db: Db, row: PublicQueryRow): Promise<PublicProduct | undefined> {
  const variants = await db<VariantRow[]>`
    SELECT id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
           created_at, updated_at, deleted_at
    FROM variants
    WHERE product_id = ${row.id}
      AND deleted_at IS NULL
      AND status = 'on'
    ORDER BY created_at, id
  `;
  const sellable = sellableOnly(
    variants.map((variant) => ({
      ...variant,
      status: variant.status === "on" ? ("on" as const) : ("off" as const),
      deleted: variant.deleted_at !== null,
    })),
  );
  const offer = offerFrom(
    sellable.map((variant) => ({ price: variant.price, stock: variant.stock })),
  );
  if (offer === undefined) {
    return undefined;
  }
  const fields = (await loadFields(db, row.catalog_id)).map(toField);
  return {
    id: row.id,
    catalogId: row.catalog_id,
    title: row.title,
    cover: row.cover,
    currency: row.currency,
    offer: {
      price: minorUnits(offer.price),
      currency: row.currency,
      availability: offer.availability,
    },
    fields: publicAttrs(fields, readAttrs(row.attrs)),
    variants: sellable.map((variant) => ({
      id: variant.id,
      price: minorUnits(variant.price),
      currency: row.currency,
      stock: variant.stock,
      availability: availability(variant.stock),
      options: readOptionValues(variant.option_values),
      sku: variant.sku,
    })),
  };
}

async function assembleMerchant(
  db: Db,
  row: PublicQueryRow,
  includeDeletedVariants: boolean,
): Promise<ProductRecord> {
  const options = await db<
    { id: string; product_id: string; key: string; label: string; position: number }[]
  >`
    SELECT id, product_id, key, label, position
    FROM product_options
    WHERE product_id = ${row.id}
    ORDER BY position, key
  `;
  const variants = await db<VariantRow[]>`
    SELECT id, catalog_id, product_id, sku, option_values, price, stock, status, cover,
           created_at, updated_at, deleted_at
    FROM variants
    WHERE product_id = ${row.id}
      AND (${includeDeletedVariants}::boolean OR deleted_at IS NULL)
    ORDER BY created_at, id
  `;
  return productRecord(row, options, variants);
}

function filterClause(filter: ResolvedFieldFilter, add: (value: SqlParam) => string): string {
  const key = add(filter.key);
  if (filter.kind === "number") {
    return `(p.attrs->>${key})::numeric ${numberOp(filter.op)} ${add(filter.value)}`;
  }
  const value =
    filter.type === "boolean" ? (filter.value ? "true" : "false") : String(filter.value);
  return `p.attrs->>${key} = ${add(value)}`;
}

function numberOp(op: CompareOp): string {
  switch (op) {
    case "gt":
      return ">";
    case "lt":
      return "<";
    case "gte":
      return ">=";
    case "lte":
      return "<=";
    case "eq":
      return "=";
  }
}

type SqlParam = string | number | boolean | null;

function bind(params: SqlParam[]): (value: SqlParam) => string {
  return (value) => {
    params.push(value);
    return `$${String(params.length)}`;
  };
}
