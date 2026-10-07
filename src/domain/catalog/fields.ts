import { catalogFail, catalogOk, type CatalogResult } from "./result";

export const systemFieldKeys = ["title", "status", "cover", "price", "stock", "currency"] as const;

const fieldTypes = ["text", "number", "boolean", "single-select"] as const;

export type FieldType = (typeof fieldTypes)[number];

export type FieldStatus = "active" | "retired";

export type FieldValue = string | number | boolean;

export type Fields = Readonly<Record<string, FieldValue>>;

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  choices: readonly string[];
  status: FieldStatus;
};

export type FieldChange =
  | {
      op: "add_field";
      key: string;
      label: string;
      type: FieldType;
      required: boolean;
      choices: readonly string[];
    }
  | { op: "rename_label"; key: string; label: string }
  | { op: "add_choice"; key: string; choice: string }
  | { op: "remove_choice"; key: string; choice: string }
  | { op: "change_type"; key: string; type: FieldType; choices: readonly string[] }
  | { op: "make_required"; key: string }
  | { op: "make_optional"; key: string }
  | { op: "retire"; key: string }
  | { op: "rename_key"; key: string; nextKey: string };

export type FieldProduct = {
  id: string;
  status: "on" | "off";
  deleted: boolean;
  fields: Fields;
};

type ProductEffect = {
  productId: string;
  nextFields: Fields;
  nextStatus: "on" | "off";
  unpublish: boolean;
  fieldsChanged: boolean;
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
  const affectedCount = effects.filter((effect) => effect.unpublish || effect.fieldsChanged).length;
  return catalogOk({
    breaking: drafted.value.breaking,
    nextFields: drafted.value.fields,
    effects,
    affectedCount,
  });
}

export function convertFieldValue(
  value: FieldValue,
  to: FieldType,
  choices: readonly string[],
): FieldValue | undefined {
  if (to === "text") {
    return fieldToText(value);
  }
  if (to === "number") {
    return fieldToNumber(value);
  }
  if (to === "boolean") {
    return fieldToBoolean(value);
  }
  return fieldToChoice(value, choices);
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
  if (change.op === "add_choice") {
    return draftAddOption(fields, current, change.choice);
  }
  if (change.op === "remove_choice") {
    return draftRemoveOption(fields, current, change.choice);
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
  const choices = parseChoices(change.type, change.choices);
  if (!choices.ok) {
    return choices;
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
        choices: choices.value,
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
  if (current.choices.includes(parsed.value)) {
    return catalogFail("conflict", "选项已存在。");
  }
  return catalogOk({
    breaking: false,
    fields: replaceField(fields, { ...current, choices: [...current.choices, parsed.value] }),
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
  if (!current.choices.includes(option)) {
    return catalogFail("validation_error", "选项不存在。");
  }
  return catalogOk({
    breaking: true,
    fields: replaceField(fields, {
      ...current,
      choices: current.choices.filter((item) => item !== option),
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
  const choices = parseChoices(change.type, change.choices);
  if (!choices.ok) {
    return choices;
  }
  return catalogOk({
    breaking: true,
    fields: replaceField(fields, { ...current, type: change.type, choices: choices.value }),
  });
}

function effectFor(
  product: FieldProduct,
  before: readonly FieldDefinition[],
  after: readonly FieldDefinition[],
  change: Exclude<FieldChange, { op: "rename_key" }>,
): ProductEffect {
  let nextFields: Record<string, FieldValue> = { ...product.fields };
  let fieldsChanged = false;
  let reason: string | null = null;
  const previous = before.find((field) => field.key === change.key);
  const next = after.find((field) => field.key === change.key);

  if (change.op === "change_type" && previous !== undefined && next !== undefined) {
    const converted = rewriteTypedValue(nextFields, change.key, next.type, next.choices);
    nextFields = converted.fields;
    fieldsChanged = converted.changed;
    reason = converted.reason;
  }
  if (change.op === "remove_choice" && product.fields[change.key] === change.choice) {
    nextFields = omitField(nextFields, change.key);
    fieldsChanged = true;
    reason = "removed_choice";
  }
  if (change.op === "retire" && Object.prototype.hasOwnProperty.call(product.fields, change.key)) {
    nextFields = omitField(nextFields, change.key);
    fieldsChanged = true;
    reason = "retired";
  }

  const missingRequired = activeFields(after).some(
    (field) => field.required && nextFields[field.key] === undefined,
  );
  const published = product.status === "on" && !product.deleted;
  const unpublish =
    published && (reason === "conversion_failed" || reason === "removed_choice" || missingRequired);
  if (unpublish && reason === null) {
    reason = "missing_required";
  }
  return {
    productId: product.id,
    nextFields,
    nextStatus: unpublish ? "off" : product.status,
    unpublish,
    fieldsChanged,
    reason: unpublish || fieldsChanged ? reason : null,
  };
}

function rewriteTypedValue(
  fields: Record<string, FieldValue>,
  key: string,
  to: FieldType,
  choices: readonly string[],
): { fields: Record<string, FieldValue>; changed: boolean; reason: string | null } {
  const current = fields[key];
  if (current === undefined) {
    return { fields, changed: false, reason: null };
  }
  const converted = convertFieldValue(current, to, choices);
  if (converted === undefined) {
    return { fields: omitField(fields, key), changed: true, reason: "conversion_failed" };
  }
  if (converted !== current) {
    return { fields: { ...fields, [key]: converted }, changed: true, reason: null };
  }
  return { fields, changed: false, reason: null };
}

function omitField(fields: Record<string, FieldValue>, key: string): Record<string, FieldValue> {
  const next: Record<string, FieldValue> = {};
  for (const [itemKey, value] of Object.entries(fields)) {
    if (itemKey !== key) {
      next[itemKey] = value;
    }
  }
  return next;
}

function fieldToText(value: FieldValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function fieldToNumber(value: FieldValue): number | undefined {
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

function fieldToBoolean(value: FieldValue): boolean | undefined {
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

function fieldToChoice(value: FieldValue, choices: readonly string[]): string | undefined {
  const text = fieldToText(value);
  return choices.includes(text) ? text : undefined;
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

export function parseChoices(
  type: FieldType,
  choices: readonly string[],
): CatalogResult<readonly string[]> {
  if (type !== "single-select") {
    if (choices.length > 0) {
      return catalogFail("validation_error", "只有单选字段可以带选项。");
    }
    return catalogOk([]);
  }
  const parsed: string[] = [];
  for (const option of choices) {
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
  choices: string[];
  status: FieldStatus;
} {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    choices: [...field.choices],
    status: field.status,
  };
}
