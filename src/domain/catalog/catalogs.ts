import { minorUnits, type MinorUnits } from "../../shared/money";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

export const defaultCatalogName = "默认目录";

export function planCatalog(input: {
  name: string;
  currency?: string;
}): CatalogResult<{ name: string; currency: string }> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) {
    return catalogFail("validation_error", "目录名称不能为空，且不能超过 80 个字符。");
  }
  const currency = (input.currency ?? "CNY").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return catalogFail("validation_error", "货币必须是三位字母代码。");
  }
  return catalogOk({ name, currency });
}

export function defaultCatalogPlan(): { name: typeof defaultCatalogName; currency: "CNY" } {
  return { name: defaultCatalogName, currency: "CNY" };
}

export function parseMinorPrice(value: unknown): CatalogResult<MinorUnits> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return catalogFail("validation_error", "价格必须以分为单位的整数。");
  }
  return catalogOk(minorUnits(value));
}

export function parseStock(value: unknown): CatalogResult<number | null> {
  if (value === undefined || value === null) {
    return catalogOk(null);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return catalogFail("validation_error", "库存必须是非负整数或空。");
  }
  return catalogOk(value);
}

export function parseTitle(value: unknown): CatalogResult<string> {
  if (typeof value !== "string") {
    return catalogFail("validation_error", "商品名不能为空。");
  }
  const title = value.trim();
  if (title.length === 0 || title.length > 200) {
    return catalogFail("validation_error", "商品名不能为空，且不能超过 200 个字符。");
  }
  return catalogOk(title);
}

export function parseCover(value: unknown): CatalogResult<string | null> {
  if (value === undefined || value === null) {
    return catalogOk(null);
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2000) {
    return catalogFail("validation_error", "封面必须是图片 URL。");
  }
  return catalogOk(value.trim());
}

export function parseSku(value: unknown): CatalogResult<string | null> {
  if (value === undefined || value === null) {
    return catalogOk(null);
  }
  if (typeof value !== "string") {
    return catalogFail("validation_error", "SKU 必须是字符串。");
  }
  const sku = value.trim();
  if (sku.length === 0 || sku.length > 64) {
    return catalogFail("validation_error", "SKU 不能为空，且不能超过 64 个字符。");
  }
  return catalogOk(sku);
}
