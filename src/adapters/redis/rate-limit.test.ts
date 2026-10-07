import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../ports/clock";
import { createClockRateLimit } from "./clock-rate-limit";
import { createRedisRateLimit, rateLimitKey } from "./rate-limit";

const window = { name: "image-upload", limit: 30, windowMs: 60_000 } as const;

describe("upload rate limit", () => {
  it("rejects the 31st attempt inside 60 seconds and allows it after the window", async () => {
    let now = 1_000_000;
    const clock: Clock = { now: () => new Date(now) };
    const limiter = createClockRateLimit(clock);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(limiter.consume({ subject: "mch_a", windows: [window] })).resolves.toMatchObject(
        {
          ok: true,
          allowed: true,
        },
      );
    }
    await expect(limiter.consume({ subject: "mch_a", windows: [window] })).resolves.toEqual({
      ok: true,
      allowed: false,
    });

    now += 60_001;
    await expect(limiter.consume({ subject: "mch_a", windows: [window] })).resolves.toMatchObject({
      ok: true,
      allowed: true,
    });
  });

  it("maps Redis failures to unavailable and does not trust a second client", async () => {
    const calls: { keys: string[]; script: string }[] = [];
    const failing = createRedisRateLimit({
      eval: () => Promise.reject(new Error("connection reset")),
    });
    await expect(failing.consume({ subject: "mch_a", windows: [window] })).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });

    const limited = createRedisRateLimit({
      eval: (script, options) => {
        calls.push({ keys: options.keys, script });
        return Promise.resolve(0);
      },
    });
    await expect(limited.consume({ subject: "mch_a", windows: [window] })).resolves.toEqual({
      ok: true,
      allowed: false,
    });
    expect(calls[0]?.keys).toEqual([rateLimitKey("image-upload", "mch_a")]);
    expect(calls[0]?.script).toContain("TIME");
    expect(calls[0]?.script).toContain("ZADD");
    expect(calls[0]?.script).toContain("ZREMRANGEBYSCORE");

    const client = await readFile(path.join(process.cwd(), "src/adapters/redis/client.ts"), "utf8");
    expect(client.match(/createClient\(/g)).toHaveLength(1);
    const assembly = await readFile(
      path.join(process.cwd(), "src/composition/register-all.ts"),
      "utf8",
    );
    expect(assembly).toContain("openRedisClient");
    expect(assembly).not.toContain("createRedisClient");
    expect(assembly).not.toContain("MEDIA_ROOT");
    expect(assembly).not.toContain("clock-rate-limit");
  });
});
