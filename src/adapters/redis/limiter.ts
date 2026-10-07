import { randomBytes } from "node:crypto";
import type {
  RateLimitPolicy,
  RateLimitPort,
  RateLimitReleaseResult,
  RateLimitReservation,
  RateLimitReserveResult,
} from "../../ports/rate-limit";
import { getRedisClient, type RedisEvalClient } from "./client";
import { windowKey } from "./window";

const nowArg = 1;
const memberArg = 2;

export const reserveScript = `
local now = tonumber(ARGV[${String(nowArg)}])
local member = ARGV[${String(memberArg)}]
local count = #KEYS
if now == nil or member == nil or count == 0 then
  return {2, 0}
end
for i = 1, count do
  local limit = tonumber(ARGV[${String(memberArg)} + i])
  local window = tonumber(ARGV[${String(memberArg)} + count + i])
  if limit == nil or window == nil then
    return {2, i}
  end
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local size = redis.call('ZCOUNT', KEYS[i], '-inf', now)
  if size >= limit then
    return {0, i}
  end
end
for i = 1, count do
  local window = tonumber(ARGV[${String(memberArg)} + count + i])
  redis.call('ZADD', KEYS[i], now, member)
  redis.call('PEXPIRE', KEYS[i], window)
end
return {1, 0}
`;

export const releaseScript = `
local member = ARGV[1]
for i = 1, #KEYS do
  redis.call('ZREM', KEYS[i], member)
end
return 1
`;

export type RedisRateLimitOptions = {
  url: string;
  policies: Readonly<Record<string, RateLimitPolicy>>;
  client?: RedisEvalClient;
};

export function createRedisRateLimit(options: RedisRateLimitOptions): RateLimitPort {
  return {
    async reserve(input): Promise<RateLimitReserveResult> {
      const selected = selectPolicies(options.policies, input.policies);
      if (!selected.ok) {
        return selected;
      }
      const member = randomBytes(16).toString("base64url");
      try {
        const reply = await evalScript(options, reserveScript, {
          keys: selected.policies.map((policy) => windowKey(policy.name, input.subject)),
          arguments: reserveArguments(
            input.now.getTime(),
            member,
            selected.policies.map((policy) => policy.limit),
            selected.policies.map((policy) => policy.windowMs),
          ),
        });
        return mapReserve(reply, selected.policies, {
          id: member,
          subject: input.subject,
          policies: [...input.policies],
        });
      } catch {
        return { ok: false, error: "unavailable" };
      }
    },
    async release(reservation): Promise<RateLimitReleaseResult> {
      try {
        await evalScript(options, releaseScript, {
          keys: reservation.policies.map((policy) => windowKey(policy, reservation.subject)),
          arguments: [reservation.id],
        });
        return { ok: true };
      } catch {
        return { ok: false, error: "unavailable" };
      }
    },
  };
}

function selectPolicies(
  registered: Readonly<Record<string, RateLimitPolicy>>,
  names: readonly string[],
):
  | { ok: true; policies: { name: string; limit: number; windowMs: number }[] }
  | { ok: false; error: "unavailable" } {
  if (names.length === 0) {
    return { ok: false, error: "unavailable" };
  }
  const policies: { name: string; limit: number; windowMs: number }[] = [];
  for (const name of names) {
    const policy = registered[name];
    if (policy === undefined || policy.limit < 1 || policy.windowMs < 1) {
      return { ok: false, error: "unavailable" };
    }
    policies.push({ name, limit: policy.limit, windowMs: policy.windowMs });
  }
  return { ok: true, policies };
}

export function reserveArguments(
  nowMs: number,
  member: string,
  limits: readonly number[],
  windowsMs: readonly number[],
): string[] {
  return [String(nowMs), member, ...limits.map(String), ...windowsMs.map(String)];
}

async function evalScript(
  options: RedisRateLimitOptions,
  script: string,
  command: { keys: string[]; arguments: string[] },
): Promise<unknown> {
  const client = options.client ?? (await getRedisClient(options.url));
  return client.eval(script, command);
}

function mapReserve(
  reply: unknown,
  policies: readonly { name: string }[],
  reservation: RateLimitReservation,
): RateLimitReserveResult {
  if (!Array.isArray(reply) || reply.length < 1) {
    return { ok: false, error: "unavailable" };
  }
  const status = Number(reply[0]);
  if (status === 1) {
    return { ok: true, reservation };
  }
  if (status !== 0 || reply.length < 2) {
    return { ok: false, error: "unavailable" };
  }
  const policy = policies[Number(reply[1]) - 1];
  if (policy === undefined) {
    return { ok: false, error: "unavailable" };
  }
  return { ok: false, error: "limited", policy: policy.name };
}
