import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RateLimitPolicy } from "../../ports/rate-limit";
import { assertRedisReady, type RedisEvalClient } from "./client";
import { createRedisRateLimit, releaseScript, reserveArguments, reserveScript } from "./limiter";
import { createMemoryRateLimit } from "./memory";
import { applyReserve, windowKey, type WindowState } from "./window";

const policies = {
  "sms-send:60s": { limit: 1, windowMs: 60_000 },
  "sms-send:24h": { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

describe("sliding window", () => {
  it("lets only one concurrent reservation succeed for the same subject", async () => {
    const limiter = createMemoryRateLimit(policies);
    const now = new Date("2026-05-16T00:00:00.000Z");
    const [first, second] = await Promise.all([
      limiter.reserve({ subject: "13800138000", policies: ["sms-send:60s", "sms-send:24h"], now }),
      limiter.reserve({ subject: "13800138000", policies: ["sms-send:60s", "sms-send:24h"], now }),
    ]);
    const allowed = [first, second].filter((result) => result.ok);
    expect(allowed).toHaveLength(1);
    expect([first, second]).toContainEqual({
      ok: false,
      error: "limited",
      policy: "sms-send:60s",
    });
  });

  it("does not consume the short window when the longer window is already full", () => {
    const state: WindowState = new Map();
    const dailyKey = windowKey("sms-send:24h", "13800138000");
    const now = Date.parse("2026-05-16T12:00:00.000Z");
    state.set(
      dailyKey,
      Array.from({ length: 10 }, (_item, index) => ({
        member: `old-${String(index)}`,
        at: now - 60_000 * (index + 1),
      })),
    );
    const decision = applyReserve(state, {
      keys: [windowKey("sms-send:60s", "13800138000"), dailyKey],
      nowMs: now,
      member: "new",
      limits: [1, 10],
      windowsMs: [60_000, 24 * 60 * 60 * 1000],
    });
    expect(decision).toEqual({ ok: false, policyIndex: 1 });
    expect(state.get(windowKey("sms-send:60s", "13800138000"))).toEqual([]);
  });

  it("releases a reservation so the same window can be used again", async () => {
    const limiter = createMemoryRateLimit(policies);
    const now = new Date("2026-05-16T00:00:00.000Z");
    const reserved = await limiter.reserve({
      subject: "13800138000",
      policies: ["sms-send:60s", "sms-send:24h"],
      now,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) {
      return;
    }
    await expect(limiter.release(reserved.reservation)).resolves.toEqual({ ok: true });
    await expect(
      limiter.reserve({ subject: "13800138000", policies: ["sms-send:60s", "sms-send:24h"], now }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("redis limiter", () => {
  it("reserves both policies in one script and keeps a second caller out", async () => {
    const state: WindowState = new Map();
    const calls: string[][] = [];
    const client: RedisEvalClient = {
      eval: (script, options) => {
        calls.push(options.keys);
        if (script === releaseScript) {
          return Promise.resolve(1);
        }
        const nowMs = Number(options.arguments[0]);
        const member = options.arguments[1];
        const count = options.keys.length;
        if (member === undefined || !Number.isFinite(nowMs)) {
          return Promise.resolve([2, 0]);
        }
        const decision = applyReserve(state, {
          keys: options.keys,
          nowMs,
          member,
          limits: options.arguments.slice(2, 2 + count).map(Number),
          windowsMs: options.arguments.slice(2 + count).map(Number),
        });
        return Promise.resolve(decision.ok ? [1, 0] : [0, decision.policyIndex + 1]);
      },
    };
    const limiter = createRedisRateLimit({
      url: "redis://redis.internal:6379",
      policies,
      client,
    });
    const now = new Date("2026-05-16T00:00:00.000Z");
    const [first, second] = await Promise.all([
      limiter.reserve({ subject: "13800138000", policies: ["sms-send:60s", "sms-send:24h"], now }),
      limiter.reserve({ subject: "13800138000", policies: ["sms-send:60s", "sms-send:24h"], now }),
    ]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect(calls.every((keys) => keys.length === 2)).toBe(true);
    expect(reserveScript.indexOf("ZADD")).toBeGreaterThan(
      reserveScript.indexOf("ZREMRANGEBYSCORE"),
    );
    expect(reserveArguments(now.getTime(), "member", [1, 10], [60_000, 86_400_000])).toEqual([
      String(now.getTime()),
      "member",
      "1",
      "10",
      "60000",
      "86400000",
    ]);
  });

  it("returns unavailable when Redis cannot be reached and does not touch PostgreSQL", async () => {
    const limiter = createRedisRateLimit({
      url: "redis://127.0.0.1:1",
      policies,
      client: {
        eval: () => Promise.reject(new Error("ECONNREFUSED")),
      },
    });
    await expect(
      limiter.reserve({
        subject: "13800138000",
        policies: ["sms-send:60s", "sms-send:24h"],
        now: new Date("2026-05-16T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    const adapter = await readFile("src/adapters/redis/limiter.ts", "utf8");
    const buyers = await readFile("src/app-services/identity/buyers.ts", "utf8");
    expect(adapter).not.toMatch(/sms_sends|postgres/);
    expect(buyers).not.toContain("sms_sends");
    await expect(
      assertRedisReady("redis://127.0.0.1:1", {
        eval: () => Promise.resolve(null),
        ping: () => Promise.reject(new Error("ECONNREFUSED")),
      }),
    ).rejects.toThrow("ECONNREFUSED");
  });
});
