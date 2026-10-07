import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../ports/clock";
import { imageUploadPolicies } from "../../ports/rate-limit";
import { createClockRateLimit } from "./clock-rate-limit";
import { createRedisRateLimit } from "./limiter";
import { windowKey } from "./window";

const policy = "image-upload";

describe("upload rate limit", () => {
  it("rejects the 31st attempt inside 60 seconds and allows it after the window", async () => {
    let now = 1_000_000;
    const clock: Clock = { now: () => new Date(now) };
    const limiter = createClockRateLimit(clock);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        limiter.reserve({ subject: "mch_a", policies: [policy], now: clock.now() }),
      ).resolves.toMatchObject({ ok: true });
    }
    await expect(
      limiter.reserve({ subject: "mch_a", policies: [policy], now: clock.now() }),
    ).resolves.toEqual({
      ok: false,
      error: "limited",
      policy,
    });

    now += 60_001;
    await expect(
      limiter.reserve({ subject: "mch_a", policies: [policy], now: clock.now() }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("maps Redis failures to unavailable and uses one client", async () => {
    const calls: { keys: string[]; script: string }[] = [];
    const failing = createRedisRateLimit({
      url: "redis://127.0.0.1:1",
      policies: imageUploadPolicies,
      client: {
        eval: () => Promise.reject(new Error("connection reset")),
      },
    });
    await expect(
      failing.reserve({ subject: "mch_a", policies: [policy], now: new Date(1_000) }),
    ).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });

    const limited = createRedisRateLimit({
      url: "redis://127.0.0.1:1",
      policies: imageUploadPolicies,
      client: {
        eval: (script, options) => {
          calls.push({ keys: options.keys, script });
          return Promise.resolve([0, 1]);
        },
      },
    });
    await expect(
      limited.reserve({ subject: "mch_a", policies: [policy], now: new Date(1_000) }),
    ).resolves.toEqual({
      ok: false,
      error: "limited",
      policy,
    });
    expect(calls[0]?.keys).toEqual([windowKey(policy, "mch_a")]);
    expect(calls[0]?.script).toContain("ZADD");
    expect(calls[0]?.script).toContain("ZREMRANGEBYSCORE");

    const client = await readFile(path.join(process.cwd(), "src/adapters/redis/client.ts"), "utf8");
    expect(client.match(/createClient\(/g)).toHaveLength(1);
    const assembly = await readFile(
      path.join(process.cwd(), "src/composition/register-all.ts"),
      "utf8",
    );
    expect(assembly).toContain("getRedisClient");
    expect(assembly).not.toContain("createRedisClient");
    expect(assembly).not.toContain("MEDIA_ROOT");
    expect(assembly).not.toContain("clock-rate-limit");
  });
});
