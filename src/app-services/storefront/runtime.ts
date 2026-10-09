import type { Clock } from "../../ports/clock";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";
import { storefrontUploadPolicies } from "../../domain/storefront/limits";
import type { StorefrontStore } from "./store";

export { storefrontUploadPolicies };

export type StorefrontRuntime = {
  rateLimit: RateLimitPort;
  objectStorage: ObjectStoragePort;
  clock: Clock;
  store: StorefrontStore;
  readOrderStatus: (input: { request: Request; orderId: string }) => Promise<string | null>;
};

const slotKey = Symbol.for("merclink.storefrontRuntime");

type RuntimeSlot = { current?: StorefrontRuntime };

function slot(): RuntimeSlot {
  const globalSlot = globalThis as typeof globalThis & { [slotKey]?: RuntimeSlot };
  globalSlot[slotKey] ??= {};
  return globalSlot[slotKey];
}

export function bindStorefrontRuntime(runtime: StorefrontRuntime): void {
  slot().current = runtime;
}

export function resetStorefrontRuntime(): void {
  slot().current = undefined;
}

export function storefrontRuntime(): StorefrontRuntime | undefined {
  return slot().current;
}
