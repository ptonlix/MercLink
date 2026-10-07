import { missingRequired } from "./attributes";
import type { Fields } from "./fields";
import { isFieldKey, isSystemFieldKey, parseLabel, type FieldDefinition } from "./fields";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

export type VariantStatus = "on" | "off";

export type VariantState = {
  optionValues: Readonly<Record<string, string>>;
  status: VariantStatus;
  deleted: boolean;
  price: number;
};

function axisKeys(optionValues: Readonly<Record<string, string>>): string[] {
  return Object.keys(optionValues).sort();
}

export function isSellableVariant(variant: { status: VariantStatus; deleted: boolean }): boolean {
  return !variant.deleted && variant.status === "on";
}

export function validateDeclareAxis(input: {
  declaredAxes: readonly string[];
  existing: readonly VariantState[];
  key: string;
  label: string;
}): CatalogResult<{ key: string; label: string }> {
  const key = input.key.trim();
  if (!isFieldKey(key) || isSystemFieldKey(key)) {
    return catalogFail("validation_error", "规格轴 key 只能使用小写英文、数字和下划线。");
  }
  if (input.declaredAxes.includes(key)) {
    return catalogFail("conflict", "规格轴已存在。");
  }
  const label = parseLabel(input.label);
  if (!label.ok) {
    return label;
  }
  const axisBacked = input.existing.some(
    (variant) => !variant.deleted && axisKeys(variant.optionValues).length > 0,
  );
  if (axisBacked) {
    return catalogFail("conflict", "已有规格组合，不能再增加规格轴。");
  }
  return catalogOk({ key, label: label.value });
}

export function validateVariantOptions(input: {
  declaredAxes: readonly string[];
  existing: readonly VariantState[];
  optionValues: Readonly<Record<string, string>>;
}): CatalogResult<Readonly<Record<string, string>>> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.optionValues)) {
    const axis = key.trim();
    const option = value.trim();
    if (!isFieldKey(axis) || option.length === 0 || option.length > 80) {
      return catalogFail("validation_error", "规格组合的轴和值都不能为空。");
    }
    normalized[axis] = option;
  }
  const keys = axisKeys(normalized);
  const declared = [...input.declaredAxes].sort();
  if (keys.length === 0) {
    if (declared.length > 0) {
      return catalogFail("conflict", "已声明规格轴后，不能再创建无轴规格。");
    }
    const defaultExists = input.existing.some(
      (variant) => !variant.deleted && axisKeys(variant.optionValues).length === 0,
    );
    if (defaultExists) {
      return catalogFail("conflict", "无轴默认规格已存在。");
    }
    return catalogOk({});
  }
  if (declared.length === 0) {
    return catalogFail("validation_error", "请先声明规格轴，再创建组合。");
  }
  if (!sameKeys(keys, declared)) {
    return catalogFail("conflict", "同一商品的规格必须使用同一组轴。");
  }
  const duplicate = input.existing.some(
    (variant) =>
      !variant.deleted &&
      sameKeys(axisKeys(variant.optionValues), keys) &&
      sameValues(variant.optionValues, normalized),
  );
  if (duplicate) {
    return catalogFail("conflict", "这个规格组合已经存在。");
  }
  return catalogOk(normalized);
}

export function assertPublishable(input: {
  deleted: boolean;
  fields: Fields;
  definitions: readonly FieldDefinition[];
  variants: readonly VariantState[];
}): CatalogResult<void> {
  if (input.deleted) {
    return catalogFail("conflict", "已删除的商品不能上架。");
  }
  const missing = missingRequired(input.definitions, input.fields);
  if (missing !== undefined) {
    return catalogFail("validation_error", `上架前必须填写 ${missing.label}。`);
  }
  const sellable = input.variants.filter(isSellableVariant);
  if (!sellable.some((variant) => Number.isSafeInteger(variant.price) && variant.price >= 0)) {
    return catalogFail("conflict", "至少需要一条有价格的可售规格。");
  }
  const axisBacked = input.variants.some(
    (variant) => !variant.deleted && axisKeys(variant.optionValues).length > 0,
  );
  if (axisBacked && sellable.some((variant) => axisKeys(variant.optionValues).length === 0)) {
    return catalogFail("conflict", "有轴规格之后，无轴默认规格不能再售。");
  }
  const axes = sellable.map((variant) => axisKeys(variant.optionValues));
  const first = axes[0];
  if (first !== undefined && axes.some((item) => !sameKeys(item, first))) {
    return catalogFail("conflict", "可售规格的轴不一致，不能上架。");
  }
  return catalogOk(undefined);
}

export function afterSoftDelete(): { status: "off" } {
  return { status: "off" };
}

export function afterRestoreProduct(): { status: "off"; deleted: false } {
  return { status: "off", deleted: false };
}

export function afterRestoreVariant(): { status: "off"; deleted: false } {
  return { status: "off", deleted: false };
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function sameValues(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  return axisKeys(left).every((key) => left[key] === right[key]);
}
