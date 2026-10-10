import type { PublicAvailability, PublicVariant } from "../shared/seams/public-products";

// Public HTML, Markdown, and JSON-LD share this conversion. Domain and /api/v1 stay in minor units.
export function majorUnitDecimal(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${negative ? "-" : ""}${String(whole)}.${String(fraction).padStart(2, "0")}`;
}

export function displayPrice(minor: number, currency: string): string {
  const value = majorUnitDecimal(minor);
  return currency === "CNY" ? `¥${value}` : `${currency} ${value}`;
}

export function schemaAvailability(
  availability: PublicAvailability,
): "https://schema.org/InStock" | "https://schema.org/OutOfStock" {
  return availability === "in_stock"
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

export function availabilityText(availability: PublicAvailability): string {
  return availability === "in_stock" ? "有货" : "缺货";
}

export function variantStock(variant: PublicVariant): string {
  if (variant.stock === null) return "不限库存";
  return variant.stock === 0 ? "缺货" : `库存 ${String(variant.stock)} 件`;
}

export function optionText(options: PublicVariant["optionValues"]): string {
  const parts = Object.entries(options).map(([key, value]) => `${key}=${value}`);
  return parts.length === 0 ? "默认规格" : parts.join("，");
}
