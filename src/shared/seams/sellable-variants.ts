import type { ErrorCode } from "../errors";
import type { MinorUnits } from "../money";

export type SeamTransaction = object;

export type SeamFailure = {
  ok: false;
  error: ErrorCode;
  message: string;
};

export type LockedSellable = {
  catalogId: string;
  productId: string;
  variantId: string;
  title: string;
  currency: string;
  unitPrice: MinorUnits;
  stock: number | null;
  sku: string | null;
  optionValues: Readonly<Record<string, string>>;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  schemaRevision: number;
};

export type LockSellableInput = {
  variantId?: string;
  productId?: string;
  qty: number;
  tx: SeamTransaction;
};

export type LockSellableResult = { ok: true; line: LockedSellable } | SeamFailure;

export type RestoreSellableInput = {
  variantId: string;
  qty: number;
  tx: SeamTransaction;
};

export type RestoreSellableResult = { ok: true } | SeamFailure;

export type SellableVariantsImpl = {
  lock: (input: LockSellableInput) => Promise<LockSellableResult>;
  restore: (input: RestoreSellableInput) => Promise<RestoreSellableResult>;
};

const unavailable: SeamFailure = {
  ok: false,
  error: "dependency_unavailable",
  message: "可售规格尚未就绪。",
};

let implementation: SellableVariantsImpl | undefined;

export function registerSellableVariants(impl: SellableVariantsImpl): void {
  implementation = impl;
}

export function resetSellableVariants(): void {
  implementation = undefined;
}

async function lock(input: LockSellableInput): Promise<LockSellableResult> {
  if (implementation === undefined) {
    return unavailable;
  }
  return implementation.lock(input);
}

async function restore(input: RestoreSellableInput): Promise<RestoreSellableResult> {
  if (implementation === undefined) {
    return unavailable;
  }
  return implementation.restore(input);
}

// Order close restores finite stock here. Other changes cannot edit this file.
export const sellableVariants = {
  lock,
  restore,
  register: registerSellableVariants,
  reset: resetSellableVariants,
};
