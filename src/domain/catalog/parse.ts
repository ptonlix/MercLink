import { isFieldType, type FieldChange, type FieldType } from "./fields";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

export type ParsedFieldChange = {
  change: FieldChange;
  confirm: boolean;
};

export function parseFieldChangeBody(input: unknown): CatalogResult<ParsedFieldChange> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const confirm = record.confirm === true;
  const op = readString(record, "op");
  if (op === undefined) {
    return catalogFail("validation_error", "必须提供变更操作。");
  }
  const key = readString(record, "key") ?? "";
  if (op === "rename_key") {
    return catalogOk({
      confirm,
      change: { op, key, nextKey: readString(record, "next_key") ?? "" },
    });
  }
  if (op === "add_field") {
    const type = readType(record);
    if (!type.ok) {
      return type;
    }
    const options = readOptions(record);
    if (!options.ok) {
      return options;
    }
    return catalogOk({
      confirm,
      change: {
        op,
        key,
        label: readString(record, "label") ?? "",
        type: type.value,
        required: record.required === true,
        options: options.value,
      },
    });
  }
  if (op === "rename_label") {
    return catalogOk({ confirm, change: { op, key, label: readString(record, "label") ?? "" } });
  }
  if (op === "add_option" || op === "remove_option") {
    return catalogOk({
      confirm,
      change: { op, key, option: readString(record, "option") ?? "" },
    });
  }
  if (op === "change_type") {
    const type = readType(record);
    if (!type.ok) {
      return type;
    }
    const options = readOptions(record);
    if (!options.ok) {
      return options;
    }
    return catalogOk({ confirm, change: { op, key, type: type.value, options: options.value } });
  }
  if (op === "make_required" || op === "make_optional" || op === "retire") {
    return catalogOk({ confirm, change: { op, key } });
  }
  return catalogFail("validation_error", "不支持的字段变更。");
}

export function parseFieldCreateBody(input: unknown): CatalogResult<ParsedFieldChange> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const type = readType(record);
  if (!type.ok) {
    return type;
  }
  const options = readOptions(record);
  if (!options.ok) {
    return options;
  }
  return catalogOk({
    confirm: record.confirm === true,
    change: {
      op: "add_field",
      key: readString(record, "key") ?? "",
      label: readString(record, "label") ?? "",
      type: type.value,
      required: record.required === true,
      options: options.value,
    },
  });
}

export function parseCatalogBody(
  input: unknown,
): CatalogResult<{ name: string; currency?: string }> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const name = readString(record, "name");
  if (name === undefined) {
    return catalogFail("validation_error", "目录名称不能为空。");
  }
  const currency = readString(record, "currency");
  return catalogOk({ name, ...(currency !== undefined ? { currency } : {}) });
}

export function parseProductBody(input: unknown): CatalogResult<{
  title: string;
  price?: unknown;
  stock?: unknown;
  cover?: unknown;
  sku?: unknown;
  fields: Readonly<Record<string, unknown>>;
}> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const title = readString(record, "title");
  if (title === undefined) {
    return catalogFail("validation_error", "商品名不能为空。");
  }
  const fields = readObject(record, "fields");
  if (!fields.ok) {
    return fields;
  }
  return catalogOk({
    title,
    ...(hasOwn(record, "price") ? { price: record.price } : {}),
    ...(hasOwn(record, "stock") ? { stock: record.stock } : {}),
    ...(hasOwn(record, "cover") ? { cover: record.cover } : {}),
    ...(hasOwn(record, "sku") ? { sku: record.sku } : {}),
    fields: fields.value,
  });
}

export function parseProductPatch(input: unknown): CatalogResult<{
  title?: string;
  cover?: unknown;
  fields?: Readonly<Record<string, unknown>>;
}> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const fields = hasOwn(record, "fields") ? readObject(record, "fields") : catalogOk(undefined);
  if (!fields.ok) {
    return fields;
  }
  const title = readString(record, "title");
  return catalogOk({
    ...(title !== undefined ? { title } : {}),
    ...(hasOwn(record, "cover") ? { cover: record.cover } : {}),
    ...(fields.value !== undefined ? { fields: fields.value } : {}),
  });
}

export function parseOptionBody(input: unknown): CatalogResult<{ key: string; label: string }> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  return catalogOk({
    key: readString(record, "key") ?? "",
    label: readString(record, "label") ?? "",
  });
}

export function parseVariantBody(input: unknown): CatalogResult<{
  options: Readonly<Record<string, string>>;
  price: unknown;
  stock?: unknown;
  sku?: unknown;
  cover?: unknown;
}> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const options = readStringRecord(record, "options");
  if (!options.ok) {
    return options;
  }
  if (!hasOwn(record, "price")) {
    return catalogFail("validation_error", "规格必须有价格。");
  }
  return catalogOk({
    options: options.value,
    price: record.price,
    ...(hasOwn(record, "stock") ? { stock: record.stock } : {}),
    ...(hasOwn(record, "sku") ? { sku: record.sku } : {}),
    ...(hasOwn(record, "cover") ? { cover: record.cover } : {}),
  });
}

export function parseVariantPatch(input: unknown): CatalogResult<{
  price?: unknown;
  stock?: unknown;
  sku?: unknown;
  cover?: unknown;
  status?: string;
  restore?: boolean;
}> {
  const record = asRecord(input);
  if (record === undefined) {
    return catalogFail("validation_error", "请求体必须是 JSON 对象。");
  }
  const status = readString(record, "status");
  if (status !== undefined && status !== "on" && status !== "off") {
    return catalogFail("validation_error", "规格状态只能是 on 或 off。");
  }
  return catalogOk({
    ...(hasOwn(record, "price") ? { price: record.price } : {}),
    ...(hasOwn(record, "stock") ? { stock: record.stock } : {}),
    ...(hasOwn(record, "sku") ? { sku: record.sku } : {}),
    ...(hasOwn(record, "cover") ? { cover: record.cover } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(record.restore === true ? { restore: true } : {}),
  });
}

function readType(record: Readonly<Record<string, unknown>>): CatalogResult<FieldType> {
  const type = readString(record, "type");
  if (type === undefined || !isFieldType(type)) {
    return catalogFail(
      "validation_error",
      "字段类型必须是 text、number、boolean 或 single-select。",
    );
  }
  return catalogOk(type);
}

function readOptions(record: Readonly<Record<string, unknown>>): CatalogResult<readonly string[]> {
  if (!hasOwn(record, "options") || record.options === undefined) {
    return catalogOk([]);
  }
  if (!Array.isArray(record.options) || record.options.some((item) => typeof item !== "string")) {
    return catalogFail("validation_error", "选项必须是字符串数组。");
  }
  return catalogOk(record.options);
}

function readObject(
  record: Readonly<Record<string, unknown>>,
  key: string,
): CatalogResult<Readonly<Record<string, unknown>>> {
  const value = record[key];
  if (value === undefined) {
    return catalogOk<Readonly<Record<string, unknown>>>({});
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return catalogFail("validation_error", "fields 必须是对象。");
  }
  return catalogOk(value as Readonly<Record<string, unknown>>);
}

function readStringRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
): CatalogResult<Readonly<Record<string, string>>> {
  const value = record[key];
  if (value === undefined) {
    return catalogOk<Readonly<Record<string, string>>>({});
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return catalogFail("validation_error", "options 必须是对象。");
  }
  const parsed: Record<string, string> = {};
  for (const [itemKey, itemValue] of Object.entries(value)) {
    if (typeof itemValue !== "string") {
      return catalogFail("validation_error", "规格值必须是字符串。");
    }
    parsed[itemKey] = itemValue;
  }
  return catalogOk(parsed);
}

function asRecord(input: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  return input as Readonly<Record<string, unknown>>;
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
