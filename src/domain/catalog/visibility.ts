import type { VariantStatus } from "./variants";
import { isSellableVariant } from "./variants";

export type PublicAvailability = "in_stock" | "out_of_stock";

export function isPubliclyVisible(
  product: { status: "on" | "off"; deleted: boolean },
  variants: readonly { status: VariantStatus; deleted: boolean }[],
): boolean {
  return product.status === "on" && !product.deleted && variants.some(isSellableVariant);
}

export function sellableOnly<T extends { status: VariantStatus; deleted: boolean }>(
  variants: readonly T[],
): T[] {
  return variants.filter(isSellableVariant);
}

export function availability(stock: number | null): PublicAvailability {
  if (stock === null || stock > 0) {
    return "in_stock";
  }
  return "out_of_stock";
}

export function offerFrom(
  variants: readonly { price: number; stock: number | null }[],
): { price: number; availability: PublicAvailability } | undefined {
  const first = variants[0];
  if (first === undefined) {
    return undefined;
  }
  let price = first.price;
  let inStock = false;
  for (const variant of variants) {
    if (variant.price < price) {
      price = variant.price;
    }
    if (availability(variant.stock) === "in_stock") {
      inStock = true;
    }
  }
  return { price, availability: inStock ? "in_stock" : "out_of_stock" };
}

export function merchantListIncludes(input: {
  deleted: boolean;
  status: "on" | "off";
  requestDeleted: boolean;
  requestStatus?: "on" | "off";
}): boolean {
  if (input.requestDeleted !== input.deleted) {
    return false;
  }
  if (input.requestStatus !== undefined && input.requestStatus !== input.status) {
    return false;
  }
  return true;
}
