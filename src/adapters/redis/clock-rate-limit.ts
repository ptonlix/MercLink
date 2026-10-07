import { randomBytes } from "node:crypto";
import type { Clock } from "../../ports/clock";
import type {
  RateConsumeResult,
  RateLimitPort,
  RateReleaseResult,
  RateReservation,
  RateWindow,
} from "../../ports/rate-limit";

type Stamp = { member: string; at: number };

// Clock-injected port for tests. Production assembly must use the Redis adapter.
export function createClockRateLimit(clock: Clock): RateLimitPort {
  const events = new Map<string, Stamp[]>();
  return {
    consume: (input) =>
      Promise.resolve(consume(events, clock.now().getTime(), input.subject, input.windows)),
    release: (reservation) => Promise.resolve(release(events, reservation)),
  };
}

function consume(
  events: Map<string, Stamp[]>,
  now: number,
  subject: string,
  windows: readonly RateWindow[],
): RateConsumeResult {
  if (subject.trim() === "" || windows.length === 0) {
    return { ok: false, error: "unavailable" };
  }
  const retained = new Map<string, Stamp[]>();
  for (const window of windows) {
    const key = `ratelimit:${window.name}:${subject}`;
    const current = (events.get(key) ?? []).filter((stamp) => now - stamp.at <= window.windowMs);
    if (current.length >= window.limit) {
      events.set(key, current);
      return { ok: true, allowed: false };
    }
    retained.set(key, current);
  }
  const member = randomBytes(8).toString("base64url");
  for (const window of windows) {
    const key = `ratelimit:${window.name}:${subject}`;
    const current = retained.get(key) ?? [];
    current.push({ member, at: now });
    events.set(key, current);
  }
  return {
    ok: true,
    allowed: true,
    reservation: { subject, member, windows: windows.map((window) => window.name) },
  };
}

function release(events: Map<string, Stamp[]>, reservation: RateReservation): RateReleaseResult {
  for (const name of reservation.windows) {
    const key = `ratelimit:${name}:${reservation.subject}`;
    const current = events.get(key) ?? [];
    events.set(
      key,
      current.filter((stamp) => stamp.member !== reservation.member),
    );
  }
  return { ok: true };
}
