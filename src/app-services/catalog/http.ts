import { getDatabase } from "../../db/client";
import { requireMerchantScope } from "../../domain/catalog/access";
import type { CatalogErrorCode, CatalogFailure, CatalogResult } from "../../domain/catalog/result";
import { catalogFail, catalogOk } from "../../domain/catalog/result";
import type { FieldFilterInput } from "../../domain/catalog/query";
import { systemFieldKeys } from "../../domain/catalog/fields";
import { authenticate } from "../../shared/seams/authenticate";
import { apiError } from "../../shared/errors";
import type { Scope } from "../../shared/actor";
import { addField, changeFields, listFields, readSchema } from "./fields";
import { createCatalog, listCatalogs } from "./catalogs";
import {
  createProduct,
  createVariant,
  declareOption,
  patchProduct,
  patchVariant,
  publishProduct,
  restoreProduct,
  softDeleteProduct,
  softDeleteVariant,
  unpublishProduct,
} from "./products";
import { getPublicProduct, listMerchantProducts, listPublicProducts } from "./query";
import { registerCatalog } from "./register";
import type { Sql } from "./db";
import type { CatalogRecord, FieldRecord, ProductRecord, VariantRecord } from "./records";

let boundSql: Sql | undefined;
let registeredSql: Sql | undefined;

export function bindCatalogSql(sql: Sql | undefined): void {
  boundSql = sql;
  registeredSql = undefined;
}

function catalogSql(): Sql {
  if (boundSql !== undefined) {
    return boundSql;
  }
  return getDatabase().sql;
}

function ensureCatalogRegistered(): Sql {
  const sql = catalogSql();
  if (registeredSql !== sql) {
    registerCatalog(sql);
    registeredSql = sql;
  }
  return sql;
}

async function merchantGate(
  request: Request,
  scope: Scope,
): Promise<{ ok: true; merchantId: string } | { ok: false; response: Response }> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }
  const decision = requireMerchantScope(auth.actor, scope);
  if (!decision.ok) {
    return { ok: false, response: failureResponse(decision) };
  }
  return { ok: true, merchantId: decision.value.merchantId };
}

async function readJson(request: Request): Promise<CatalogResult<unknown>> {
  const text = await request.text();
  if (text.trim() === "") {
    return catalogOk({});
  }
  try {
    return catalogOk(JSON.parse(text) as unknown);
  } catch {
    return catalogFail("validation_error", "请求体不是有效的 JSON。");
  }
}

function fieldFiltersFrom(url: URL): CatalogResult<FieldFilterInput[]> {
  const filters: FieldFilterInput[] = [];
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith("field.")) {
      continue;
    }
    const match = /^field\.([a-z][a-z0-9_]*)\.(gt|lt|eq|gte|lte)$/.exec(key);
    const fieldKey = match?.[1];
    const op = match?.[2];
    if (fieldKey === undefined || op === undefined) {
      return catalogFail("validation_error", "字段过滤格式无效。");
    }
    filters.push({ key: fieldKey, op, raw: value });
  }
  return catalogOk(filters);
}

function failureResponse(failure: CatalogFailure): Response {
  return apiError(failure.error, failure.message, statusFor(failure.error));
}

function jsonResult<T>(
  result: CatalogResult<T>,
  map: (value: T) => unknown,
  status = 200,
): Response {
  if (!result.ok) {
    return failureResponse(result);
  }
  return Response.json(map(result.value), { status });
}

export async function getProducts(request: Request): Promise<Response> {
  const sql = ensureCatalogRegistered();
  const url = new URL(request.url);
  const filters = fieldFiltersFrom(url);
  if (!filters.ok) {
    return failureResponse(filters);
  }
  const page = await listPublicProducts(sql, {
    ...(url.searchParams.get("q") !== null ? { q: url.searchParams.get("q") ?? undefined } : {}),
    ...(url.searchParams.get("limit") !== null
      ? { limit: url.searchParams.get("limit") ?? undefined }
      : {}),
    ...(url.searchParams.get("cursor") !== null
      ? { cursor: url.searchParams.get("cursor") ?? undefined }
      : {}),
    ...(url.searchParams.get("catalog_id") !== null
      ? { catalogId: url.searchParams.get("catalog_id") ?? undefined }
      : {}),
    ...(url.searchParams.get("min_price") !== null
      ? { minPrice: url.searchParams.get("min_price") ?? undefined }
      : {}),
    ...(url.searchParams.get("max_price") !== null
      ? { maxPrice: url.searchParams.get("max_price") ?? undefined }
      : {}),
    fieldFilters: filters.value,
  });
  return jsonResult(page, (value) => ({
    items: value.items.map(publicProductJson),
    next_cursor: value.nextCursor,
  }));
}

export async function getProduct(id: string): Promise<Response> {
  const sql = ensureCatalogRegistered();
  const product = await getPublicProduct(sql, id);
  return jsonResult(product, publicProductJson);
}

export async function getCatalogs(request: Request): Promise<Response> {
  const gate = await merchantGate(request, "product:read");
  if (!gate.ok) {
    return gate.response;
  }
  const sql = ensureCatalogRegistered();
  const items = await listCatalogs(sql, gate.merchantId);
  return Response.json({ items: items.map(catalogJson) });
}

export async function postCatalog(request: Request): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readJson(request);
  if (!body.ok) {
    return failureResponse(body);
  }
  const sql = ensureCatalogRegistered();
  const created = await createCatalog(sql, gate.merchantId, body.value);
  return jsonResult(created, catalogJson, 201);
}

export async function getSchema(request: Request, catalogId: string): Promise<Response> {
  const actor =
    request.headers.get("authorization") === null ? undefined : await authenticate(request);
  if (actor !== undefined && !actor.ok) {
    return actor.response;
  }
  const sql = ensureCatalogRegistered();
  const schema = await readSchema(sql, catalogId, actor?.ok === true ? actor.actor : undefined);
  return jsonResult(schema, (value) => ({
    catalog_id: value.catalogId,
    currency: value.currency,
    schema_revision: value.schemaRevision,
    system_fields: systemFieldKeys,
    fields: value.fields.map(fieldJson),
  }));
}

export async function getFields(request: Request, catalogId: string): Promise<Response> {
  const gate = await merchantGate(request, "product:read");
  if (!gate.ok) {
    return gate.response;
  }
  const sql = ensureCatalogRegistered();
  const fields = await listFields(sql, gate.merchantId, catalogId);
  return jsonResult(fields, (value) => ({ items: value.map(fieldJson) }));
}

export async function postField(request: Request, catalogId: string): Promise<Response> {
  return postFieldChange(request, catalogId, "create");
}

export async function postFieldChange(
  request: Request,
  catalogId: string,
  kind: "create" | "change",
): Promise<Response> {
  const gate = await merchantGate(request, "field:write");
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readJson(request);
  if (!body.ok) {
    return failureResponse(body);
  }
  const sql = ensureCatalogRegistered();
  const result =
    kind === "create"
      ? await addField(sql, gate.merchantId, catalogId, body.value)
      : await changeFields(sql, gate.merchantId, catalogId, body.value);
  return jsonResult(result, (value) =>
    value.applied
      ? {
          applied: true,
          revision: value.revision,
          affected_count: value.affectedCount,
          field: value.field === null ? null : fieldJson({ id: "", ...value.field }),
        }
      : {
          applied: false,
          breaking: true,
          affected_count: value.affectedCount,
          affected: value.affected.map((item) => ({
            product_id: item.productId,
            reason: item.reason,
          })),
        },
  );
}

export async function getMerchantProducts(request: Request, catalogId: string): Promise<Response> {
  const gate = await merchantGate(request, "product:read");
  if (!gate.ok) {
    return gate.response;
  }
  const url = new URL(request.url);
  const sql = ensureCatalogRegistered();
  const page = await listMerchantProducts(sql, gate.merchantId, catalogId, {
    ...(url.searchParams.get("status") !== null
      ? { status: url.searchParams.get("status") ?? undefined }
      : {}),
    ...(url.searchParams.get("deleted") !== null
      ? { deleted: url.searchParams.get("deleted") ?? undefined }
      : {}),
    ...(url.searchParams.get("limit") !== null
      ? { limit: url.searchParams.get("limit") ?? undefined }
      : {}),
    ...(url.searchParams.get("cursor") !== null
      ? { cursor: url.searchParams.get("cursor") ?? undefined }
      : {}),
  });
  return jsonResult(page, (value) => ({
    items: value.items.map(productJson),
    next_cursor: value.nextCursor,
  }));
}

export async function postProduct(request: Request, catalogId: string): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readJson(request);
  if (!body.ok) {
    return failureResponse(body);
  }
  const sql = ensureCatalogRegistered();
  const created = await createProduct(sql, gate.merchantId, catalogId, body.value);
  return jsonResult(created, productJson, 201);
}

export async function patchProductRoute(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateWithBody(request, catalogId, productId, patchProduct, 200);
}

export async function publishProductRoute(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateProduct(request, catalogId, productId, (sql, merchantId, catalog, product) =>
    publishProduct(sql, merchantId, catalog, product),
  );
}

export async function unpublishProductRoute(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateProduct(request, catalogId, productId, (sql, merchantId, catalog, product) =>
    unpublishProduct(sql, merchantId, catalog, product),
  );
}

export async function deleteProductRoute(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateProduct(request, catalogId, productId, (sql, merchantId, catalog, product) =>
    softDeleteProduct(sql, merchantId, catalog, product),
  );
}

export async function restoreProductRoute(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateProduct(request, catalogId, productId, (sql, merchantId, catalog, product) =>
    restoreProduct(sql, merchantId, catalog, product),
  );
}

export async function postOption(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateWithBody(request, catalogId, productId, declareOption);
}

export async function postVariant(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  return mutateWithBody(request, catalogId, productId, createVariant);
}

export async function patchVariantRoute(
  request: Request,
  catalogId: string,
  variantId: string,
): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readJson(request);
  if (!body.ok) {
    return failureResponse(body);
  }
  const sql = ensureCatalogRegistered();
  const updated = await patchVariant(sql, gate.merchantId, catalogId, variantId, body.value);
  return jsonResult(updated, productJson);
}

export async function deleteVariantRoute(
  request: Request,
  catalogId: string,
  variantId: string,
): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const sql = ensureCatalogRegistered();
  const deleted = await softDeleteVariant(sql, gate.merchantId, catalogId, variantId);
  return jsonResult(deleted, productJson);
}

function statusFor(error: CatalogErrorCode): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "insufficient_stock":
    case "variant_required":
      return 409;
    default:
      return 400;
  }
}

async function mutateProduct(
  request: Request,
  catalogId: string,
  productId: string,
  run: (
    sql: Sql,
    merchantId: string,
    catalogId: string,
    productId: string,
    body: unknown,
  ) => Promise<CatalogResult<ProductRecord>>,
): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const sql = ensureCatalogRegistered();
  const updated = await run(sql, gate.merchantId, catalogId, productId, {});
  return jsonResult(updated, productJson);
}

async function mutateWithBody(
  request: Request,
  catalogId: string,
  productId: string,
  run: (
    sql: Sql,
    merchantId: string,
    catalogId: string,
    productId: string,
    body: unknown,
  ) => Promise<CatalogResult<ProductRecord>>,
  status = 201,
): Promise<Response> {
  const gate = await merchantGate(request, "product:write");
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readJson(request);
  if (!body.ok) {
    return failureResponse(body);
  }
  const sql = ensureCatalogRegistered();
  const updated = await run(sql, gate.merchantId, catalogId, productId, body.value);
  return jsonResult(updated, productJson, status);
}

function catalogJson(catalog: CatalogRecord) {
  return {
    id: catalog.id,
    name: catalog.name,
    currency: catalog.currency,
    schema_revision: catalog.schemaRevision,
    created_at: catalog.createdAt.toISOString(),
    updated_at: catalog.updatedAt.toISOString(),
  };
}

function fieldJson(field: FieldRecord) {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options,
    status: field.status,
  };
}

function variantJson(variant: VariantRecord) {
  return {
    id: variant.id,
    sku: variant.sku,
    options: variant.optionValues,
    price: variant.price,
    stock: variant.stock,
    status: variant.deleted ? "off" : variant.status,
    cover: variant.cover,
    deleted: variant.deleted,
  };
}

function productJson(product: ProductRecord) {
  return {
    id: product.id,
    catalog_id: product.catalogId,
    title: product.title,
    status: product.status,
    cover: product.cover,
    fields: product.attrs,
    schema_revision: product.schemaRevision,
    created_at: product.createdAt.toISOString(),
    updated_at: product.updatedAt.toISOString(),
    deleted_at: product.deletedAt?.toISOString() ?? null,
    options: product.options,
    variants: product.variants
      .filter((variant) => product.deletedAt !== null || !variant.deleted)
      .map(variantJson),
  };
}

function publicProductJson(product: {
  id: string;
  catalogId: string;
  title: string;
  cover: string | null;
  currency: string;
  offer: { price: number; currency: string; availability: string };
  fields: Readonly<Record<string, string | number | boolean | null>>;
  variants: readonly {
    id: string;
    price: number;
    currency: string;
    stock: number | null;
    availability: string;
    options: Readonly<Record<string, string>>;
    sku: string | null;
  }[];
}) {
  return {
    id: product.id,
    catalog_id: product.catalogId,
    title: product.title,
    cover: product.cover,
    currency: product.currency,
    offer: product.offer,
    fields: product.fields,
    variants: product.variants,
  };
}
