import type { Clock } from "../../ports/clock";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";

export type MediaRuntime = {
  rateLimit: RateLimitPort;
  objectStorage: ObjectStoragePort;
  mediaBaseUrl: string;
  clock: Clock;
};

// Next bundles instrumentation and route handlers separately. A module-local
// binding set at startup is invisible to the upload route, so every upload
// looks like the storage dependency is down.
const slotKey = Symbol.for("merclink.mediaRuntime");

type MediaSlot = { current?: MediaRuntime };

function slot(): MediaSlot {
  const globalSlot = globalThis as typeof globalThis & { [slotKey]?: MediaSlot };
  globalSlot[slotKey] ??= {};
  return globalSlot[slotKey];
}

export function bindMediaRuntime(runtime: MediaRuntime): void {
  slot().current = runtime;
}

export function resetMediaRuntime(): void {
  slot().current = undefined;
}

export function mediaRuntime(): MediaRuntime | undefined {
  return slot().current;
}

export function mediaBaseUrl(): string {
  const current = slot().current;
  if (current !== undefined && current.mediaBaseUrl.trim() !== "") {
    return current.mediaBaseUrl;
  }
  return process.env.APP_BASE_URL?.trim() ?? "";
}
