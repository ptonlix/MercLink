import { activeFields, isFieldKey, type FieldDefinition, type FieldType } from "./fields";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

const defaultPageLimit = 20;
const maxPageLimit = 50;

export type CompareOp = "gt" | "lt" | "eq" | "gte" | "lte";

export type FieldFilterInput = {
  key: string;
  op: string;
  raw: string;
};

export type ResolvedFieldFilter =
  | { kind: "number"; key: string; op: CompareOp; value: number }
  | { kind: "eq"; key: string; value: string | boolean; type: Exclude<FieldType, "number"> };

export type Cursor = {
  createdAt: string;
  id: string;
};

export type ParsedPublicQuery = {
  q?: string;
  limit: number;
  cursor?: Cursor;
  catalogId?: string;
  minPrice?: number;
  maxPrice?: number;
  fieldFilters: readonly FieldFilterInput[];
};

const compareOps = ["gt", "lt", "eq", "gte", "lte"] as const;

export function parsePublicQuery(input: {
  q?: string;
  limit?: string;
  cursor?: string;
  catalogId?: string;
  minPrice?: string;
  maxPrice?: string;
  fieldFilters: readonly FieldFilterInput[];
}): CatalogResult<ParsedPublicQuery> {
  if (input.fieldFilters.length > 0 && !present(input.catalogId)) {
    return catalogFail("validation_error", "自定义字段过滤必须指定目录。");
  }
  const limit = parseLimit(input.limit);
  if (!limit.ok) {
    return limit;
  }
  const cursor = parseCursor(input.cursor);
  if (!cursor.ok) {
    return cursor;
  }
  const minPrice = parseBound(input.minPrice, "最低价");
  if (!minPrice.ok) {
    return minPrice;
  }
  const maxPrice = parseBound(input.maxPrice, "最高价");
  if (!maxPrice.ok) {
    return maxPrice;
  }
  if (
    minPrice.value !== undefined &&
    maxPrice.value !== undefined &&
    minPrice.value > maxPrice.value
  ) {
    return catalogFail("validation_error", "最低价不能高于最高价。");
  }
  const q = input.q?.trim();
  if (q !== undefined && q.length > 200) {
    return catalogFail("validation_error", "关键词不能超过 200 个字符。");
  }
  const catalogId = present(input.catalogId) ? input.catalogId.trim() : undefined;
  return catalogOk({
    ...(q !== undefined && q.length > 0 ? { q } : {}),
    limit: limit.value,
    ...(cursor.value !== undefined ? { cursor: cursor.value } : {}),
    ...(catalogId !== undefined ? { catalogId } : {}),
    ...(minPrice.value !== undefined ? { minPrice: minPrice.value } : {}),
    ...(maxPrice.value !== undefined ? { maxPrice: maxPrice.value } : {}),
    fieldFilters: input.fieldFilters,
  });
}

export function resolveFieldFilters(
  filters: readonly FieldFilterInput[],
  fields: readonly FieldDefinition[],
): CatalogResult<readonly ResolvedFieldFilter[]> {
  const resolved: ResolvedFieldFilter[] = [];
  for (const filter of filters) {
    const item = resolveOne(filter, fields);
    if (!item.ok) {
      return item;
    }
    resolved.push(item.value);
  }
  return catalogOk(resolved);
}

export function parseMerchantProductQuery(input: {
  status?: string;
  deleted?: string;
  limit?: string;
  cursor?: string;
}): CatalogResult<{
  status?: "on" | "off";
  deleted: boolean;
  limit: number;
  cursor?: Cursor;
}> {
  let status: "on" | "off" | undefined;
  if (input.status !== undefined && input.status !== "") {
    if (input.status !== "on" && input.status !== "off") {
      return catalogFail("validation_error", "状态只能是 on 或 off。");
    }
    status = input.status;
  }
  if (
    input.deleted !== undefined &&
    input.deleted !== "" &&
    input.deleted !== "true" &&
    input.deleted !== "false"
  ) {
    return catalogFail("validation_error", "deleted 只能是 true 或 false。");
  }
  const limit = parseLimit(input.limit);
  if (!limit.ok) {
    return limit;
  }
  const cursor = parseCursor(input.cursor);
  if (!cursor.ok) {
    return cursor;
  }
  return catalogOk({
    ...(status !== undefined ? { status } : {}),
    deleted: input.deleted === "true",
    limit: limit.value,
    ...(cursor.value !== undefined ? { cursor: cursor.value } : {}),
  });
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function resolveOne(
  filter: FieldFilterInput,
  fields: readonly FieldDefinition[],
): CatalogResult<ResolvedFieldFilter> {
  if (!isFieldKey(filter.key)) {
    return catalogFail("unknown_field", "字段不存在。");
  }
  if (!isCompareOp(filter.op)) {
    return catalogFail("validation_error", "不支持的字段比较。");
  }
  const field = fields.find((item) => item.key === filter.key);
  if (field === undefined) {
    return catalogFail("unknown_field", "字段不存在。");
  }
  if (field.status === "retired") {
    return catalogFail("field_retired", "字段已停用。");
  }
  if (field.type === "number") {
    const value = Number(filter.raw);
    if (!Number.isFinite(value) || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(filter.raw.trim())) {
      return catalogFail("validation_error", "数字过滤必须是有限数字。");
    }
    return catalogOk({ kind: "number", key: field.key, op: filter.op, value });
  }
  if (filter.op !== "eq") {
    return catalogFail("validation_error", "该字段只支持等于过滤。");
  }
  if (field.type === "boolean") {
    if (filter.raw !== "true" && filter.raw !== "false") {
      return catalogFail("validation_error", "是否过滤只能是 true 或 false。");
    }
    return catalogOk({ kind: "eq", key: field.key, type: "boolean", value: filter.raw === "true" });
  }
  if (field.type === "single-select" && !field.choices.includes(filter.raw)) {
    return catalogOk({ kind: "eq", key: field.key, type: field.type, value: filter.raw });
  }
  return catalogOk({ kind: "eq", key: field.key, type: field.type, value: filter.raw });
}

function parseLimit(value: string | undefined): CatalogResult<number> {
  if (value === undefined || value === "") {
    return catalogOk(defaultPageLimit);
  }
  if (!/^\d+$/.test(value)) {
    return catalogFail("validation_error", "limit 必须是 1 到 50 的整数。");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPageLimit) {
    return catalogFail("validation_error", "limit 必须是 1 到 50 的整数。");
  }
  return catalogOk(limit);
}

function parseCursor(value: string | undefined): CatalogResult<Cursor | undefined> {
  if (value === undefined || value === "") {
    return catalogOk(undefined);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isCursor(parsed)) {
      return catalogFail("validation_error", "分页游标无效。");
    }
    return catalogOk(parsed);
  } catch {
    return catalogFail("validation_error", "分页游标无效。");
  }
}

function parseBound(value: string | undefined, label: string): CatalogResult<number | undefined> {
  if (value === undefined || value === "") {
    return catalogOk(undefined);
  }
  if (!/^\d+$/.test(value)) {
    return catalogFail("validation_error", `${label}必须以分为单位的整数。`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return catalogFail("validation_error", `${label}必须以分为单位的整数。`);
  }
  return catalogOk(parsed);
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("createdAt" in value) || !("id" in value)) {
    return false;
  }
  return (
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isCompareOp(value: string): value is CompareOp {
  return (compareOps as readonly string[]).includes(value);
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

export function textFieldKeys(fields: readonly FieldDefinition[]): string[] {
  return activeFields(fields)
    .filter((field) => field.type === "text")
    .map((field) => field.key);
}
