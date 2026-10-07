import { createAlipayPaymentPort } from "../../adapters/alipay";
import { getDatabase } from "../../db/client";
import { systemClock, type Clock } from "../../ports/clock";
import type { PaymentPort } from "../../ports/payment";
import { loadEnv } from "../../shared/env";
import { createDrizzleCommerceRepository } from "./drizzle-store";
import type { CommerceRepository } from "./repository";

type CatalogOwnership = (merchantId: string) => Promise<readonly string[]> | readonly string[];

export type CommerceRuntime = {
  repo: CommerceRepository;
  payment: PaymentPort;
  clock: Clock;
  ownedCatalogs: CatalogOwnership;
};

let override: CommerceRuntime | undefined;
let cached: CommerceRuntime | undefined;
let ownership: CatalogOwnership = () => [];

export function registerCatalogOwnership(fn: CatalogOwnership): void {
  ownership = fn;
}

export function resetCatalogOwnership(): void {
  ownership = () => [];
}

export function useCommerceRuntime(runtime: CommerceRuntime): void {
  override = runtime;
}

export function resetCommerceRuntime(): void {
  override = undefined;
  cached = undefined;
}

export function commerceRuntime(): CommerceRuntime {
  if (override !== undefined) {
    return override;
  }
  cached ??= createProductionRuntime();
  return cached;
}

function createProductionRuntime(): CommerceRuntime {
  const loaded = loadEnv(process.env);
  if (!loaded.ok) {
    throw new Error(loaded.message);
  }
  return {
    repo: createDrizzleCommerceRepository(getDatabase(loaded.env.DATABASE_URL).db),
    payment: createAlipayPaymentPort({
      appId: loaded.env.ALIPAY_APP_ID,
      privateKey: loaded.env.ALIPAY_PRIVATE_KEY,
      alipayPublicKey: loaded.env.ALIPAY_PUBLIC_KEY,
      notifyUrl: loaded.env.ALIPAY_NOTIFY_URL,
      product: process.env.ALIPAY_PRODUCT === "alipayplus" ? "alipayplus" : "domestic",
    }),
    clock: systemClock,
    ownedCatalogs: (merchantId) => ownership(merchantId),
  };
}
