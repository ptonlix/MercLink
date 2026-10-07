import type { Clock } from "../../ports/clock";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";

export type MediaRuntime = {
  rateLimit: RateLimitPort;
  objectStorage: ObjectStoragePort;
  mediaBaseUrl: string;
  clock: Clock;
};

let current: MediaRuntime | undefined;

export function bindMediaRuntime(runtime: MediaRuntime): void {
  current = runtime;
}

export function resetMediaRuntime(): void {
  current = undefined;
}

export function mediaRuntime(): MediaRuntime | undefined {
  return current;
}

export function mediaBaseUrl(): string {
  if (current !== undefined && current.mediaBaseUrl.trim() !== "") {
    return current.mediaBaseUrl;
  }
  return process.env.APP_BASE_URL?.trim() ?? "";
}
