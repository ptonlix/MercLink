import type { SlotContext, SlotProduct } from "../domain/storefront/slots";
import type { PublicProduct } from "../shared/seams/public-products";
import type { PublicStoreProfile } from "../shared/seams/public-store";

export function slotProductFromPublic(product: PublicProduct): SlotProduct {
  const stocks = product.variants.map((variant) => variant.stock).filter((stock) => stock !== null);
  return {
    id: product.id,
    catalogId: product.catalogId,
    name: product.title,
    description: product.description,
    cover: product.cover,
    fields: product.fields,
    fieldLabels: product.fieldLabels,
    axisLabels: product.axisLabels ?? {},
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
    contactPhone: store.contact?.phone ?? null,
    contactLabel: store.contact?.label ?? null,
    contactQr: store.contact?.qrUrl ?? null,
    licenseName: store.license?.name ?? null,
    licenseCreditCode: store.license?.creditCode ?? null,
    licenseLegalPerson: store.license?.legalPerson ?? null,
    licenseAddress: store.license?.registeredAddress ?? null,
    licenseImage: store.license?.imageUrl ?? null,
  };
}
