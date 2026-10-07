import type { MinorUnits } from "../money";

export type PublicAvailability = "in_stock" | "out_of_stock";

export type PublicVariant = {
  id: string;
  price: MinorUnits;
  currency: string;
  stock: number | null;
  availability: PublicAvailability;
  optionValues: Readonly<Record<string, string>>;
  sku: string | null;
};

export type PublicOffer = {
  price: MinorUnits;
  currency: string;
  availability: PublicAvailability;
};

export type PublicProduct = {
  id: string;
  catalogId: string;
  title: string;
  cover: string | null;
  currency: string;
  offer: PublicOffer;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  variants: readonly PublicVariant[];
};

export type PublicProductPage = {
  items: readonly PublicProduct[];
  nextCursor: string | null;
};

export type PublicListQuery = {
  q?: string;
  limit?: number;
  cursor?: string;
  catalogId?: string;
  minPrice?: MinorUnits;
  maxPrice?: MinorUnits;
};

export type PublicGetResult =
  { ok: true; product: PublicProduct } | { ok: false; error: "not_found"; message: string };

export type PublicProductsImpl = {
  list: (query: PublicListQuery) => Promise<PublicProductPage>;
  get: (id: string) => Promise<PublicGetResult>;
};

let implementation: PublicProductsImpl | undefined;

export function registerPublicProducts(impl: PublicProductsImpl): void {
  implementation = impl;
}

export function resetPublicProducts(): void {
  implementation = undefined;
}

async function list(query: PublicListQuery): Promise<PublicProductPage> {
  if (implementation === undefined) {
    return { items: [], nextCursor: null };
  }
  return implementation.list(query);
}

async function get(id: string): Promise<PublicGetResult> {
  if (implementation === undefined) {
    return { ok: false, error: "not_found", message: "没有找到。" };
  }
  return implementation.get(id);
}

export const publicProducts = {
  list,
  get,
  register: registerPublicProducts,
  reset: resetPublicProducts,
};
