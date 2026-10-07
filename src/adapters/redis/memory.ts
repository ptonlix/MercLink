import { randomBytes } from "node:crypto";
import type {
  RateLimitPolicy,
  RateLimitPort,
  RateLimitReleaseResult,
  RateLimitReservation,
  RateLimitReserveResult,
} from "../../ports/rate-limit";
import { applyRelease, applyReserve, windowKey, type WindowState } from "./window";

export function createMemoryRateLimit(
  policies: Readonly<Record<string, RateLimitPolicy>>,
): RateLimitPort {
  const state: WindowState = new Map();
  let tail: Promise<void> = Promise.resolve();

  function exclusive<T>(run: () => T): Promise<T> {
    const result = tail.then(run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    reserve(input) {
      return exclusive(() => reservePolicies(state, policies, input));
    },
    release(reservation) {
      return exclusive(() => releaseReservation(state, reservation));
    },
  };
}

function reservePolicies(
  state: WindowState,
  policies: Readonly<Record<string, RateLimitPolicy>>,
  input: { subject: string; policies: readonly string[]; now: Date },
): RateLimitReserveResult {
  const selected: { name: string; policy: RateLimitPolicy }[] = [];
  for (const name of input.policies) {
    const policy = policies[name];
    if (policy === undefined) {
      return { ok: false, error: "unavailable" };
    }
    selected.push({ name, policy });
  }
  const member = randomBytes(16).toString("base64url");
  const decision = applyReserve(state, {
    keys: selected.map((item) => windowKey(item.name, input.subject)),
    nowMs: input.now.getTime(),
    member,
    limits: selected.map((item) => item.policy.limit),
    windowsMs: selected.map((item) => item.policy.windowMs),
  });
  if (!decision.ok) {
    const policy = selected[decision.policyIndex]?.name;
    if (policy === undefined) {
      return { ok: false, error: "unavailable" };
    }
    return { ok: false, error: "limited", policy };
  }
  return {
    ok: true,
    reservation: { id: member, subject: input.subject, policies: [...input.policies] },
  };
}

function releaseReservation(
  state: WindowState,
  reservation: RateLimitReservation,
): RateLimitReleaseResult {
  applyRelease(
    state,
    reservation.policies.map((policy) => windowKey(policy, reservation.subject)),
    reservation.id,
  );
  return { ok: true };
}
