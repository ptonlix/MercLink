import { describe, expect, it } from "vitest";
import { smsDailyCap, smsMinIntervalMs } from "../../domain/identity/registration";
import type { Clock } from "../../ports/clock";
import {
  checkBuyerSms,
  completeBuyerRegistration,
  findBuyerByEmail,
  requestBuyerSms,
} from "./buyers";
import { withIdentityDatabase } from "./database";
import { fakeCaptcha, fakeSms } from "./fakes";

describe("buyer registration", () => {
  it("does not call SMS when captcha verification fails", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const captcha = fakeCaptcha(() => false);
      const result = await requestBuyerSms(
        { sql, clock: fixedClock(0), captcha, sms },
        { phone: "13800138000", captchaVerifyParam: "bad-param" },
      );
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
      const flow = { sql, clock: fixedClock(0), captcha, sms };
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
        { sql, clock: fixedClock(smsMinIntervalMs), captcha: fakeCaptcha(() => true), sms },
        { phone: "13800138000", captchaVerifyParam: "captcha-2" },
      );
      expect(again).toEqual({ ok: true, mode: "login" });
      await checkBuyerSms(
        { sql, clock: fixedClock(smsMinIntervalMs), captcha, sms },
        { phone: "13800138000", code: sms.acceptCode },
      );
      const duplicate = await completeBuyerRegistration(
        { sql, clock: fixedClock(smsMinIntervalMs), captcha, sms },
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
      const first = await requestBuyerSms(
        { sql, clock: fixedClock(0), captcha: fakeCaptcha(() => true), sms },
        { phone: "13800138000", captchaVerifyParam: "captcha-1" },
      );
      expect(first.ok).toBe(true);
      const second = await requestBuyerSms(
        { sql, clock: fixedClock(30_000), captcha: fakeCaptcha(() => true), sms },
        { phone: "13800138000", captchaVerifyParam: "captcha-2" },
      );
      expect(second).toMatchObject({ ok: false, error: "sms_rate_limited" });
      expect(sms.sendCalls).toEqual(["13800138000"]);
    });
  });

  it("rejects the daily cap without calling SMS", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      for (let index = 0; index < smsDailyCap; index += 1) {
        const sent = await requestBuyerSms(
          {
            sql,
            clock: fixedClock(index * smsMinIntervalMs),
            captcha: fakeCaptcha(() => true),
            sms,
          },
          { phone: "13800138000", captchaVerifyParam: `captcha-${index}` },
        );
        expect(sent.ok).toBe(true);
      }
      const blocked = await requestBuyerSms(
        {
          sql,
          clock: fixedClock(smsDailyCap * smsMinIntervalMs),
          captcha: fakeCaptcha(() => true),
          sms,
        },
        { phone: "13800138000", captchaVerifyParam: "captcha-over" },
      );
      expect(blocked).toMatchObject({ ok: false, error: "sms_rate_limited" });
      expect(sms.sendCalls).toHaveLength(smsDailyCap);
    });
  });

  it("invalidates the challenge after repeated wrong SMS checks", async () => {
    await withIdentityDatabase(async (sql) => {
      const sms = fakeSms();
      const flow = { sql, clock: fixedClock(0), captcha: fakeCaptcha(() => true), sms };
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

function fixedClock(offsetMs: number): Clock {
  return { now: () => new Date(Date.parse("2026-05-16T00:00:00.000Z") + offsetMs) };
}
