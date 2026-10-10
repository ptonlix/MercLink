import type { SlotContext, SlotProduct } from "../domain/storefront/slots";
import type { PublicProduct } from "../shared/seams/public-products";
import type { PublicStoreProfile } from "../shared/seams/public-store";

export function slotProductFromPublic(product: PublicProduct): SlotProduct {
  const stocks = product.variants.map((variant) => variant.stock).filter((stock) => stock !== null);
  return {
    id: product.id,
    catalogId: product.catalogId,
    name: product.title,
    cover: product.cover,
    fields: product.fields,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      currency: variant.currency,
      optionValues: variant.optionValues,
      stock: variant.stock,
      availability: variant.availability,
      priceMinor: variant.price,
    })),
    stock: stocks.length === 0 ? null : Math.min(...stocks),
    availability: product.offer.availability,
    priceMinor: product.offer.price,
    currency: product.offer.currency,
  };
}

export function slotStoreFromPublic(store: PublicStoreProfile | null): SlotContext["store"] {
  if (store === null) {
    return null;
  }
  return {
    displayName: store.displayName,
    summary: store.summary,
    logo: store.logoUrl,
    website: store.websiteUrl,
    area: store.areaServed,
    address: store.address,
  };
}
