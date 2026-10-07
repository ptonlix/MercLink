import { randomBytes } from "node:crypto";
import type {
  RateConsumeResult,
  RateLimitPort,
  RateReleaseResult,
  RateReservation,
  RateWindow,
} from "../../ports/rate-limit";

export type RedisEvalClient = {
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
};

const consumeScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local member = ARGV[1]
local count = #KEYS
for i = 1, count do
  local limit = tonumber(ARGV[i * 2])
  local window = tonumber(ARGV[i * 2 + 1])
  local key = KEYS[i]
  redis.call('ZREMRANGEBYSCORE', key, '-inf', '(' .. tostring(now - window))
  if redis.call('ZCARD', key) >= limit then
    return 0
  end
end
for i = 1, count do
  local window = tonumber(ARGV[i * 2 + 1])
  local key = KEYS[i]
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
end
return 1
`;

const releaseScript = `
local member = ARGV[1]
for i = 1, #KEYS do
  redis.call('ZREM', KEYS[i], member)
end
return 1
`;

export function rateLimitKey(windowName: string, subject: string): string {
  return `ratelimit:${windowName}:${subject}`;
}

export function createRedisRateLimit(client: RedisEvalClient): RateLimitPort {
  return {
    consume: (input) => consume(client, input.subject, input.windows),
    release: (reservation) => release(client, reservation),
  };
}

async function consume(
  client: RedisEvalClient,
  subject: string,
  windows: readonly RateWindow[],
): Promise<RateConsumeResult> {
  if (
    subject.trim() === "" ||
    windows.length === 0 ||
    windows.some((window) => !validWindow(window))
  ) {
    return { ok: false, error: "unavailable" };
  }
  const member = randomBytes(16).toString("base64url");
  try {
    const result = await client.eval(consumeScript, {
      keys: windows.map((window) => rateLimitKey(window.name, subject)),
      arguments: [
        member,
        ...windows.flatMap((window) => [String(window.limit), String(window.windowMs)]),
      ],
    });
    const allowed = allowedFlag(result);
    if (allowed === undefined) {
      return { ok: false, error: "unavailable" };
    }
    if (!allowed) {
      return { ok: true, allowed: false };
    }
    return {
      ok: true,
      allowed: true,
      reservation: { subject, member, windows: windows.map((window) => window.name) },
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

async function release(
  client: RedisEvalClient,
  reservation: RateReservation,
): Promise<RateReleaseResult> {
  if (reservation.windows.length === 0) {
    return { ok: true };
  }
  try {
    await client.eval(releaseScript, {
      keys: reservation.windows.map((name) => rateLimitKey(name, reservation.subject)),
      arguments: [reservation.member],
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function validWindow(window: RateWindow): boolean {
  return window.name.trim() !== "" && window.limit > 0 && window.windowMs > 0;
}

function allowedFlag(value: unknown): boolean | undefined {
  if (value === 1 || value === 1n || value === "1" || value === true) {
    return true;
  }
  if (value === 0 || value === 0n || value === "0" || value === false) {
    return false;
  }
  return undefined;
}
