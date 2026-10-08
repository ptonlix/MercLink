import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMemoryRateLimit } from "../../adapters/redis/memory";
import {
  registrationChallengeTtlMs,
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
  existingBuyerMustLogin,
  findBuyerByEmail,
  loginBuyerWithPassword,
  registrationAccountSession,
  requestBuyerSms,
  type BuyerFlow,
} from "./buyers";
import { hashPassword } from "./passwords";
import { createPublicId } from "../../shared/id";
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
      const challenges = await sql<{ id: string }[]>`
        SELECT id FROM registration_challenges WHERE phone = '13800138000'
      `;
      expect(challenges[0]?.id.startsWith("chg_")).toBe(true);
      expect(challenges[0]?.id.startsWith("grn_")).toBe(false);
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
      expect(duplicate).toMatchObject({
        ok: false,
        error: "conflict",
        message: existingBuyerMustLogin,
      });
      expect(registrationAccountSession(duplicate)).toBeNull();
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

  it("does not authenticate intent=register after SMS verification once a buyer exists", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const flow = registrationFlow(sql, 0, sms, openLimiter());
      await requestBuyerSms(flow, { phone: "13800138000", captchaVerifyParam: "captcha-1" });
      expect(await checkBuyerSms(flow, { phone: "13800138000", code: sms.acceptCode })).toEqual({
        ok: true,
        mode: "register",
      });
      const created = await completeBuyerRegistration(flow, {
        phone: "13800138000",
        password: "buyer-password",
      });
      expect(created).toMatchObject({ ok: true, created: true });

      const phoneOnly = await completeBuyerRegistration(flow, {
        phone: "13800138000",
        password: "",
      });
      expect(phoneOnly.ok).toBe(false);
      expect(registrationAccountSession(phoneOnly)).toBeNull();
      expect(phoneOnly).not.toHaveProperty("buyerId");

      const replay = await completeBuyerRegistration(flow, {
        phone: "13800138000",
        password: "buyer-password",
      });
      expect(replay.ok).toBe(false);
      expect(registrationAccountSession(replay)).toBeNull();
      const spent = await sql<{ open: string }[]>`
        SELECT count(*) AS open
        FROM registration_challenges
        WHERE phone = '13800138000' AND invalidated_at IS NULL
      `;
      expect(spent[0]?.open).toBe("0");

      const buyerId = createPublicId("buyer");
      const passwordHash = await hashPassword("stored-password");
      await sql`
        INSERT INTO buyers (id, phone, password_hash, phone_verified_at)
        VALUES (${buyerId}, '13900139000', ${passwordHash}, ${flow.clock.now()})
      `;
      await sql`
        INSERT INTO registration_challenges (
          id, phone, captcha_hash, sms_verified_at, created_at
        ) VALUES (
          ${createPublicId("challenge")}, '13900139000', 'captcha-hash',
          ${flow.clock.now()}, ${flow.clock.now()}
        )
      `;
      const bypass = await completeBuyerRegistration(flow, {
        phone: "13900139000",
        password: "not-the-password",
      });
      expect(bypass).toMatchObject({
        ok: false,
        error: "conflict",
        message: existingBuyerMustLogin,
      });
      expect(registrationAccountSession(bypass)).toBeNull();
      const route = await readFile("src/app/authorize/buyer/submit/route.ts", "utf8");
      const registerBranch = route.slice(
        route.indexOf('intent === "register"'),
        route.indexOf('intent === "password"'),
      );
      expect(registerBranch).toContain("registrationAccountSession");
      expect(registerBranch.indexOf("registrationAccountSession")).toBeLessThan(
        registerBranch.indexOf("accountRedirect"),
      );

      const wrongPassword = await loginBuyerWithPassword(flow, {
        phone: "13900139000",
        password: "not-the-password",
      });
      expect(wrongPassword.ok).toBe(false);
      const loggedIn = await loginBuyerWithPassword(flow, {
        phone: "13900139000",
        password: "stored-password",
      });
      expect(loggedIn).toMatchObject({ ok: true, buyer: { id: buyerId } });
      const consumed = await sql<{ open: string }[]>`
        SELECT count(*) AS open
        FROM registration_challenges
        WHERE phone = '13900139000' AND invalidated_at IS NULL
      `;
      expect(consumed[0]?.open).toBe("0");
    });
  });

  it("does not log in the loser of a registration unique-violation race", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const flow = registrationFlow(sql, 0, sms, openLimiter());
      await requestBuyerSms(flow, { phone: "13700137000", captchaVerifyParam: "captcha-1" });
      await checkBuyerSms(flow, { phone: "13700137000", code: sms.acceptCode });
      const [first, second] = await Promise.all([
        completeBuyerRegistration(flow, { phone: "13700137000", password: "buyer-password" }),
        completeBuyerRegistration(flow, { phone: "13700137000", password: "buyer-password" }),
      ]);
      const successes = [first, second].filter((result) => result.ok);
      expect(successes).toHaveLength(1);
      for (const result of [first, second]) {
        if (!result.ok) {
          expect(registrationAccountSession(result)).toBeNull();
          expect(result).not.toHaveProperty("buyerId");
        }
      }
      const buyers = await sql<{ count: string }[]>`
        SELECT count(*) FROM buyers WHERE phone = '13700137000'
      `;
      expect(buyers[0]?.count).toBe("1");
    });
  });

  it("rejects a registration challenge once it reaches the 10 minute TTL", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const limiter = openLimiter();
      const started = registrationFlow(sql, 0, sms, limiter);
      await requestBuyerSms(started, { phone: "13600136000", captchaVerifyParam: "captcha-1" });
      await checkBuyerSms(started, { phone: "13600136000", code: sms.acceptCode });
      const expired = await completeBuyerRegistration(
        registrationFlow(sql, registrationChallengeTtlMs, sms, limiter),
        { phone: "13600136000", password: "buyer-password" },
      );
      expect(expired).toMatchObject({ ok: false, error: "captcha_required" });
      expect(registrationAccountSession(expired)).toBeNull();
      const buyers = await sql<{ count: string }[]>`SELECT count(*) FROM buyers`;
      expect(buyers[0]?.count).toBe("0");
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
