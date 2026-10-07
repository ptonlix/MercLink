import type { Clock } from "../../ports/clock";
import { imageUploadPolicies, type RateLimitPort } from "../../ports/rate-limit";
import { createMemoryRateLimit } from "./memory";

// Clock-injected port for tests. Production assembly must use the Redis adapter.
export function createClockRateLimit(clock: Clock): RateLimitPort {
  const inner = createMemoryRateLimit(imageUploadPolicies);
  return {
    reserve(input) {
      return inner.reserve({ ...input, now: clock.now() });
    },
    release(reservation) {
      return inner.release(reservation);
    },
  };
}
