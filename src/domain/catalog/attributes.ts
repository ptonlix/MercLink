import {
  activeFields,
  isSystemFieldKey,
  type FieldDefinition,
  type Fields,
  type FieldValue,
} from "./fields";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

export function validateFields(
  definitions: readonly FieldDefinition[],
  input: Readonly<Record<string, unknown>>,
): CatalogResult<Fields> {
  const active = activeFields(definitions);
  const byKey = new Map(active.map((field) => [field.key, field]));
  const retired = new Set(
    definitions.filter((field) => field.status === "retired").map((field) => field.key),
  );
  const fields: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (key === "price" || key === "stock") {
      return catalogFail("validation_error", "价格和库存不能写入商品字段。");
    }
    if (isSystemFieldKey(key)) {
      return catalogFail("validation_error", "系统字段不能写入商品字段。");
    }
    if (retired.has(key)) {
      return catalogFail("field_retired", "字段已停用。");
    }
    const field = byKey.get(key);
    if (field === undefined) {
      return catalogFail("unknown_field", "字段不存在。");
    }
    const parsed = parseFieldValue(field, value);
    if (!parsed.ok) {
      return parsed;
    }
    fields[key] = parsed.value;
  }
  return catalogOk(fields);
}

export function missingRequired(
  definitions: readonly FieldDefinition[],
  fields: Fields,
): FieldDefinition | undefined {
  return activeFields(definitions).find(
    (field) => field.required && fields[field.key] === undefined,
  );
}

export function publicFields(
  definitions: readonly FieldDefinition[],
  fields: Fields,
): Record<string, FieldValue> {
  const visible: Record<string, FieldValue> = {};
  for (const field of activeFields(definitions)) {
    const value = fields[field.key];
    if (value !== undefined) {
      visible[field.key] = value;
    }
  }
  return visible;
}

function parseFieldValue(field: FieldDefinition, value: unknown): CatalogResult<FieldValue> {
  if (field.type === "text") {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 2000) {
      return catalogFail("validation_error", "文本字段必须是非空字符串。");
    }
    return catalogOk(value);
  }
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return catalogFail("validation_error", "数字字段必须是有限数字。");
    }
    return catalogOk(value);
  }
  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      return catalogFail("validation_error", "是否字段必须是布尔值。");
    }
    return catalogOk(value);
  }
  if (typeof value !== "string" || !field.choices.includes(value)) {
    return catalogFail("validation_error", "单选值必须是已声明的选项。");
  }
  return catalogOk(value);
}
