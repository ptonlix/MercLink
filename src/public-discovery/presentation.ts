import type { PublicAvailability, PublicVariant } from "../shared/seams/public-products";

export function displayPrice(minor: number, currency: string): string {
  const value = (minor / 100).toFixed(2);
  return currency === "CNY" ? `¥${value}` : `${currency} ${value}`;
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
