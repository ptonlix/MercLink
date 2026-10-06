import { catalogFail, catalogOk, type CatalogResult } from "./result";

export const systemFieldKeys = ["title", "status", "cover", "price", "stock", "currency"] as const;

const fieldTypes = ["text", "number", "boolean", "single-select"] as const;

export type FieldType = (typeof fieldTypes)[number];

export type FieldStatus = "active" | "retired";

export type AttrValue = string | number | boolean;

export type Attrs = Readonly<Record<string, AttrValue>>;

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: readonly string[];
  status: FieldStatus;
};

export type FieldChange =
  | {
      op: "add_field";
      key: string;
      label: string;
      type: FieldType;
      required: boolean;
      options: readonly string[];
    }
  | { op: "rename_label"; key: string; label: string }
  | { op: "add_option"; key: string; option: string }
  | { op: "remove_option"; key: string; option: string }
  | { op: "change_type"; key: string; type: FieldType; options: readonly string[] }
  | { op: "make_required"; key: string }
  | { op: "make_optional"; key: string }
  | { op: "retire"; key: string }
  | { op: "rename_key"; key: string; nextKey: string };

export type FieldProduct = {
  id: string;
  status: "on" | "off";
  deleted: boolean;
  attrs: Attrs;
};

type ProductEffect = {
  productId: string;
  nextAttrs: Attrs;
  nextStatus: "on" | "off";
  unpublish: boolean;
  attrsChanged: boolean;
  reason: string | null;
};

export type FieldChangePlan = {
  breaking: boolean;
  nextFields: readonly FieldDefinition[];
  effects: readonly ProductEffect[];
  affectedCount: number;
};

const fieldKeyPattern = /^[a-z][a-z0-9_]{0,63}$/;

export function isFieldKey(value: string): boolean {
  return fieldKeyPattern.test(value);
}

export function isSystemFieldKey(key: string): boolean {
  return (systemFieldKeys as readonly string[]).includes(key);
}

export function isFieldType(value: string): value is FieldType {
  return (fieldTypes as readonly string[]).includes(value);
}

export function activeFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields.filter((field) => field.status === "active");
}

export function planFieldChange(
  fields: readonly FieldDefinition[],
  products: readonly FieldProduct[],
  change: FieldChange,
): CatalogResult<FieldChangePlan> {
  if (change.op === "rename_key") {
    return catalogFail("validation_error", "字段 key 创建后不能修改。");
  }
  const drafted = draftFields(fields, change);
  if (!drafted.ok) {
    return drafted;
  }
  const effects = products.map((product) =>
    effectFor(product, fields, drafted.value.fields, change),
  );
  const affectedCount = effects.filter((effect) => effect.unpublish || effect.attrsChanged).length;
  return catalogOk({
    breaking: drafted.value.breaking,
    nextFields: drafted.value.fields,
    effects,
    affectedCount,
  });
}

export function convertAttrValue(
  value: AttrValue,
  to: FieldType,
  options: readonly string[],
): AttrValue | undefined {
  if (to === "text") {
    return attrToText(value);
  }
  if (to === "number") {
    return attrToNumber(value);
  }
  if (to === "boolean") {
    return attrToBoolean(value);
  }
  return attrToOption(value, options);
}

function draftFields(
  fields: readonly FieldDefinition[],
  change: Exclude<FieldChange, { op: "rename_key" }>,
): CatalogResult<{ breaking: boolean; fields: FieldDefinition[] }> {
  if (isSystemFieldKey(change.key)) {
    return catalogFail("validation_error", "系统字段不能变更。");
  }
  const current = fields.find((field) => field.key === change.key);
  if (change.op === "add_field") {
    return draftAdd(fields, change);
  }
  if (current === undefined) {
    return catalogFail("unknown_field", "字段不存在。");
  }
  if (current.status === "retired") {
    return catalogFail("field_retired", "字段已停用。");
  }
  if (change.op === "rename_label") {
    const label = parseLabel(change.label);
    if (!label.ok) {
      return label;
    }
    return catalogOk({
      breaking: false,
      fields: replaceField(fields, { ...current, label: label.value }),
    });
  }
  if (change.op === "add_option") {
    return draftAddOption(fields, current, change.option);
  }
  if (change.op === "remove_option") {
    return draftRemoveOption(fields, current, change.option);
  }
  if (change.op === "change_type") {
    return draftTypeChange(fields, current, change);
  }
  if (change.op === "make_required") {
    if (current.required) {
      return catalogFail("validation_error", "字段已经是必填。");
    }
    return catalogOk({
      breaking: true,
      fields: replaceField(fields, { ...current, required: true }),
    });
  }
  if (change.op === "make_optional") {
    if (!current.required) {
      return catalogFail("validation_error", "字段已经是可选。");
    }
    return catalogOk({
      breaking: false,
      fields: replaceField(fields, { ...current, required: false }),
    });
  }
  return catalogOk({
    breaking: true,
    fields: replaceField(fields, { ...current, status: "retired", required: false }),
  });
}

function draftAdd(
  fields: readonly FieldDefinition[],
  change: Extract<FieldChange, { op: "add_field" }>,
): CatalogResult<{ breaking: boolean; fields: FieldDefinition[] }> {
  const key = parseFieldKey(change.key);
  if (!key.ok) {
    return key;
  }
  const existing = fields.find((field) => field.key === key.value);
  if (existing?.status === "retired") {
    return catalogFail("conflict", "停用的字段 key 不能再用。");
  }
  if (existing !== undefined) {
    return catalogFail("conflict", "字段 key 已存在。");
  }
  const label = parseLabel(change.label);
  if (!label.ok) {
    return label;
  }
  const options = parseOptions(change.type, change.options);
  if (!options.ok) {
    return options;
  }
  return catalogOk({
    breaking: change.required,
    fields: [
      ...fields,
      {
        key: key.value,
        label: label.value,
        type: change.type,
        required: change.required,
        options: options.value,
        status: "active",
      },
    ],
  });
}

function draftAddOption(
  fields: readonly FieldDefinition[],
  current: FieldDefinition,
  option: string,
): CatalogResult<{ breaking: boolean; fields: FieldDefinition[] }> {
  if (current.type !== "single-select") {
    return catalogFail("validation_error", "只有单选字段可以增加选项。");
  }
  const parsed = parseOption(option);
  if (!parsed.ok) {
    return parsed;
  }
  if (current.options.includes(parsed.value)) {
    return catalogFail("conflict", "选项已存在。");
  }
  return catalogOk({
    breaking: false,
    fields: replaceField(fields, { ...current, options: [...current.options, parsed.value] }),
  });
}

function draftRemoveOption(
  fields: readonly FieldDefinition[],
  current: FieldDefinition,
  option: string,
): CatalogResult<{ breaking: boolean; fields: FieldDefinition[] }> {
  if (current.type !== "single-select") {
    return catalogFail("validation_error", "只有单选字段可以删除选项。");
  }
  if (!current.options.includes(option)) {
    return catalogFail("validation_error", "选项不存在。");
  }
  return catalogOk({
    breaking: true,
    fields: replaceField(fields, {
      ...current,
      options: current.options.filter((item) => item !== option),
    }),
  });
}

function draftTypeChange(
  fields: readonly FieldDefinition[],
  current: FieldDefinition,
  change: Extract<FieldChange, { op: "change_type" }>,
): CatalogResult<{ breaking: boolean; fields: FieldDefinition[] }> {
  if (current.type === change.type) {
    return catalogFail("validation_error", "字段类型没有变化。");
  }
  const options = parseOptions(change.type, change.options);
  if (!options.ok) {
    return options;
  }
  return catalogOk({
    breaking: true,
    fields: replaceField(fields, { ...current, type: change.type, options: options.value }),
  });
}

function effectFor(
  product: FieldProduct,
  before: readonly FieldDefinition[],
  after: readonly FieldDefinition[],
  change: Exclude<FieldChange, { op: "rename_key" }>,
): ProductEffect {
  let nextAttrs: Record<string, AttrValue> = { ...product.attrs };
  let attrsChanged = false;
  let reason: string | null = null;
  const previous = before.find((field) => field.key === change.key);
  const next = after.find((field) => field.key === change.key);

  if (change.op === "change_type" && previous !== undefined && next !== undefined) {
    const converted = rewriteTypedValue(nextAttrs, change.key, next.type, next.options);
    nextAttrs = converted.attrs;
    attrsChanged = converted.changed;
    reason = converted.reason;
  }
  if (change.op === "remove_option" && product.attrs[change.key] === change.option) {
    nextAttrs = omitAttr(nextAttrs, change.key);
    attrsChanged = true;
    reason = "removed_option";
  }
  if (change.op === "retire" && Object.prototype.hasOwnProperty.call(product.attrs, change.key)) {
    nextAttrs = omitAttr(nextAttrs, change.key);
    attrsChanged = true;
    reason = "retired";
  }

  const missingRequired = activeFields(after).some(
    (field) => field.required && nextAttrs[field.key] === undefined,
  );
  const published = product.status === "on" && !product.deleted;
  const unpublish =
    published && (reason === "conversion_failed" || reason === "removed_option" || missingRequired);
  if (unpublish && reason === null) {
    reason = "missing_required";
  }
  return {
    productId: product.id,
    nextAttrs,
    nextStatus: unpublish ? "off" : product.status,
    unpublish,
    attrsChanged,
    reason: unpublish || attrsChanged ? reason : null,
  };
}

function rewriteTypedValue(
  attrs: Record<string, AttrValue>,
  key: string,
  to: FieldType,
  options: readonly string[],
): { attrs: Record<string, AttrValue>; changed: boolean; reason: string | null } {
  const current = attrs[key];
  if (current === undefined) {
    return { attrs, changed: false, reason: null };
  }
  const converted = convertAttrValue(current, to, options);
  if (converted === undefined) {
    return { attrs: omitAttr(attrs, key), changed: true, reason: "conversion_failed" };
  }
  if (converted !== current) {
    return { attrs: { ...attrs, [key]: converted }, changed: true, reason: null };
  }
  return { attrs, changed: false, reason: null };
}

function omitAttr(attrs: Record<string, AttrValue>, key: string): Record<string, AttrValue> {
  const next: Record<string, AttrValue> = {};
  for (const [itemKey, value] of Object.entries(attrs)) {
    if (itemKey !== key) {
      next[itemKey] = value;
    }
  }
  return next;
}

function attrToText(value: AttrValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function attrToNumber(value: AttrValue): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function attrToBoolean(value: AttrValue): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function attrToOption(value: AttrValue, options: readonly string[]): string | undefined {
  const text = attrToText(value);
  return options.includes(text) ? text : undefined;
}

function replaceField(
  fields: readonly FieldDefinition[],
  next: FieldDefinition,
): FieldDefinition[] {
  return fields.map((field) => (field.key === next.key ? next : field));
}

export function parseFieldKey(value: string): CatalogResult<string> {
  const key = value.trim();
  if (!isFieldKey(key)) {
    return catalogFail("validation_error", "字段 key 只能使用小写英文、数字和下划线。");
  }
  if (isSystemFieldKey(key)) {
    return catalogFail("validation_error", "系统字段不能作为目录字段。");
  }
  return catalogOk(key);
}

export function parseLabel(value: string): CatalogResult<string> {
  const label = value.trim();
  if (label.length === 0 || label.length > 80) {
    return catalogFail("validation_error", "字段名称不能为空，且不能超过 80 个字符。");
  }
  return catalogOk(label);
}

export function parseOptions(
  type: FieldType,
  options: readonly string[],
): CatalogResult<readonly string[]> {
  if (type !== "single-select") {
    if (options.length > 0) {
      return catalogFail("validation_error", "只有单选字段可以带选项。");
    }
    return catalogOk([]);
  }
  const parsed: string[] = [];
  for (const option of options) {
    const item = parseOption(option);
    if (!item.ok) {
      return item;
    }
    if (parsed.includes(item.value)) {
      return catalogFail("validation_error", "单选项不能重复。");
    }
    parsed.push(item.value);
  }
  if (parsed.length === 0) {
    return catalogFail("validation_error", "单选字段至少需要一个选项。");
  }
  return catalogOk(parsed);
}

function parseOption(value: string): CatalogResult<string> {
  const option = value.trim();
  if (option.length === 0 || option.length > 80) {
    return catalogFail("validation_error", "选项不能为空，且不能超过 80 个字符。");
  }
  return catalogOk(option);
}

export function fieldSnapshot(field: FieldDefinition): {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  status: FieldStatus;
} {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: [...field.options],
    status: field.status,
  };
}
