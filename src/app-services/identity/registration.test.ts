import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMemoryRateLimit } from "../../adapters/redis/memory";
import {
  smsDailyCap,
  smsMinIntervalMs,
  smsRateLimitPolicies,
} from "../../domain/identity/registration";
import type { Sql } from "../../db/client";
import type { Clock } from "../../ports/clock";
import type { CaptchaPort } from "../../ports/captcha";
import type { RateLimitPort } from "../../ports/rate-limit";
import type { SmsPort } from "../../ports/sms";
import {
  checkBuyerSms,
  completeBuyerRegistration,
  findBuyerByEmail,
  requestBuyerSms,
  type BuyerFlow,
} from "./buyers";
import { withIdentityDatabase } from "./database";
import { fakeCaptcha, fakeSms } from "./fakes";

describe("buyer registration", () => {
  it("does not call SMS when captcha verification fails", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const captcha = fakeCaptcha(() => false);
      const result = await requestBuyerSms(registrationFlow(sql, 0, sms, openLimiter(), captcha), {
        phone: "13800138000",
        captchaVerifyParam: "bad-param",
      });
      expect(result).toMatchObject({ ok: false, error: "captcha_required" });
      expect(sms.sendCalls).toEqual([]);
      const buyers = await sql<{ count: string }[]>`SELECT count(*) FROM buyers`;
      expect(buyers[0]?.count).toBe("0");
    });
  });

  it("creates one buyer after SMS verification and does not look the account up by email", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const captcha = fakeCaptcha(() => true);
      const flow = registrationFlow(sql, 0, sms, openLimiter(), captcha);
      const sent = await requestBuyerSms(flow, {
        phone: "13800138000",
        captchaVerifyParam: "captcha-1",
      });
      expect(sent).toEqual({ ok: true, mode: "register" });
      expect(sms.sendCalls).toEqual(["13800138000"]);
      const checked = await checkBuyerSms(flow, { phone: "13800138000", code: sms.acceptCode });
      expect(checked).toEqual({ ok: true, mode: "register" });
      const created = await completeBuyerRegistration(flow, {
        phone: "13800138000",
        password: "buyer-password",
      });
      expect(created).toMatchObject({ ok: true, created: true, mode: "register" });
      expect(await findBuyerByEmail()).toBeNull();
      const again = await requestBuyerSms(
        registrationFlow(sql, smsMinIntervalMs, sms, openLimiter()),
        { phone: "13800138000", captchaVerifyParam: "captcha-2" },
      );
      expect(again).toEqual({ ok: true, mode: "login" });
      await checkBuyerSms(registrationFlow(sql, smsMinIntervalMs, sms, openLimiter(), captcha), {
        phone: "13800138000",
        code: sms.acceptCode,
      });
      const duplicate = await completeBuyerRegistration(
        registrationFlow(sql, smsMinIntervalMs, sms, openLimiter(), captcha),
        { phone: "13800138000", password: "another-password" },
      );
      expect(duplicate).toMatchObject({ ok: true, created: false, mode: "login" });
      const count = await sql<{ count: string }[]>`SELECT count(*) FROM buyers`;
      expect(count[0]?.count).toBe("1");
    });
  });

  it("rejects a second SMS inside 60 seconds without calling the provider", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const rateLimit = openLimiter();
      const first = await requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
        phone: "13800138000",
        captchaVerifyParam: "captcha-1",
      });
      expect(first.ok).toBe(true);
      const second = await requestBuyerSms(registrationFlow(sql, 30_000, sms, rateLimit), {
        phone: "13800138000",
        captchaVerifyParam: "captcha-2",
      });
      expect(second).toMatchObject({
        ok: false,
        error: "sms_rate_limited",
        message: "发送过于频繁，请稍后再试。",
      });
      expect(sms.sendCalls).toEqual(["13800138000"]);
    });
  });

  it("rejects the daily cap without calling SMS", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const rateLimit = openLimiter();
      for (let index = 0; index < smsDailyCap; index += 1) {
        const sent = await requestBuyerSms(
          registrationFlow(sql, index * smsMinIntervalMs, sms, rateLimit),
          { phone: "13800138000", captchaVerifyParam: `captcha-${String(index)}` },
        );
        expect(sent.ok).toBe(true);
      }
      const blocked = await requestBuyerSms(
        registrationFlow(sql, smsDailyCap * smsMinIntervalMs, sms, rateLimit),
        { phone: "13800138000", captchaVerifyParam: "captcha-over" },
      );
      expect(blocked).toMatchObject({
        ok: false,
        error: "sms_rate_limited",
        message: "今日发送次数已达上限。",
      });
      expect(sms.sendCalls).toHaveLength(smsDailyCap);
    });
  });

  it("does not let overlapping requests both pass the 60 second limit", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const rateLimit = openLimiter();
      const [first, second] = await Promise.all([
        requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
          phone: "13800138000",
          captchaVerifyParam: "captcha-a",
        }),
        requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
          phone: "13800138000",
          captchaVerifyParam: "captcha-b",
        }),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(1);
      expect([first, second]).toContainEqual(
        expect.objectContaining({ ok: false, error: "sms_rate_limited" }),
      );
      expect(sms.sendCalls).toEqual(["13800138000"]);
    });
  });

  it("releases the reservation when the provider fails so a later send can proceed", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = failingThenOkSms();
      const rateLimit = openLimiter();
      const failed = await requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
        phone: "13800138000",
        captchaVerifyParam: "captcha-1",
      });
      expect(failed).toMatchObject({ ok: false, error: "dependency_unavailable" });
      const retried = await requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
        phone: "13800138000",
        captchaVerifyParam: "captcha-2",
      });
      expect(retried).toEqual({ ok: true, mode: "register" });
      expect(sms.sendCalls).toEqual(["13800138000", "13800138000"]);
    });
  });

  it("rejects when Redis is unavailable without calling the provider or reading sms_sends", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const rateLimit: RateLimitPort = {
        reserve: () => Promise.resolve({ ok: false, error: "unavailable" }),
        release: () => Promise.resolve({ ok: true }),
      };
      const result = await requestBuyerSms(registrationFlow(sql, 0, sms, rateLimit), {
        phone: "13800138000",
        captchaVerifyParam: "captcha-1",
      });
      expect(result).toMatchObject({ ok: false, error: "dependency_unavailable" });
      expect(sms.sendCalls).toEqual([]);
      const challenges = await sql<
        { count: string }[]
      >`SELECT count(*) FROM registration_challenges`;
      expect(challenges[0]?.count).toBe("0");
      const table = await sql<{ present: string | null }[]>`
        SELECT to_regclass('sms_sends')::text AS present
      `;
      expect(table[0]?.present).toBeNull();
      const source = await readFile("src/app-services/identity/buyers.ts", "utf8");
      expect(source).not.toContain("sms_sends");
    });
  });

  it("invalidates the challenge after repeated wrong SMS checks", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const flow = registrationFlow(sql, 0, sms, openLimiter());
      await requestBuyerSms(flow, { phone: "13800138000", captchaVerifyParam: "captcha-1" });
      for (let index = 0; index < 5; index += 1) {
        const failed = await checkBuyerSms(flow, { phone: "13800138000", code: "000000" });
        expect(failed.ok).toBe(false);
      }
      expect(sms.checkCalls).toHaveLength(5);
      const after = await checkBuyerSms(flow, { phone: "13800138000", code: sms.acceptCode });
      expect(after).toMatchObject({ ok: false, error: "captcha_required" });
      expect(sms.checkCalls).toHaveLength(5);
    });
  });
});

function registrationFlow(
  sql: Sql,
  offsetMs: number,
  sms: SmsPort,
  rateLimit: RateLimitPort,
  captcha: CaptchaPort = fakeCaptcha(() => true),
): BuyerFlow {
  return { sql, clock: fixedClock(offsetMs), captcha, sms, rateLimit };
}

function openLimiter(): RateLimitPort {
  return createMemoryRateLimit(smsRateLimitPolicies());
}

function failingThenOkSms(): SmsPort & { sendCalls: string[] } {
  const sendCalls: string[] = [];
  let failed = false;
  return {
    sendCalls,
    sendCode: (input) => {
      sendCalls.push(input.phone);
      if (!failed) {
        failed = true;
        return Promise.resolve({ ok: false, message: "供应商暂不可用。" });
      }
      return Promise.resolve({ ok: true });
    },
    checkCode: () => Promise.resolve({ ok: true }),
  };
}

function fixedClock(offsetMs: number): Clock {
  return { now: () => new Date(Date.parse("2026-05-16T00:00:00.000Z") + offsetMs) };
}
