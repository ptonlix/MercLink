import type { SeamTransaction } from "./sellable-variants";

export type DefaultCatalogInput = {
  merchantId: string;
  tx: SeamTransaction;
};

export type DefaultCatalogResult = { status: "pending" } | { status: "created"; catalogId: string };

export type DefaultCatalogImpl = (input: DefaultCatalogInput) => Promise<DefaultCatalogResult>;

let implementation: DefaultCatalogImpl | undefined;

export function registerDefaultCatalog(impl: DefaultCatalogImpl): void {
  implementation = impl;
}

export function resetDefaultCatalog(): void {
  implementation = undefined;
}

async function create(input: DefaultCatalogInput): Promise<DefaultCatalogResult> {
  if (implementation === undefined) {
    return { status: "pending" };
  }
  return implementation(input);
}

export const defaultCatalog = {
  create,
  register: registerDefaultCatalog,
  reset: resetDefaultCatalog,
};
