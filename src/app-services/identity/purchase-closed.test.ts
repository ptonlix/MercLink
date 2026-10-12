import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { resetPurchaseModeCache } from "../../shared/purchase-mode";
import {
  checkBuyerSms,
  completeBuyerRegistration,
  loginBuyerWithPassword,
  requestBuyerSms,
  type BuyerFlow,
} from "./buyers";
import { fakeCaptcha, fakeSms } from "./fakes";

beforeEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

afterEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

function closedFlow(): BuyerFlow & {
  captcha: ReturnType<typeof fakeCaptcha>;
  sms: ReturnType<typeof fakeSms>;
} {
  const captcha = fakeCaptcha(() => {
    throw new Error("captcha");
  });
  const sms = fakeSms();
  return {
    sql: (() => Promise.reject(new Error("sql"))) as never,
    clock: { now: () => new Date() },
    captcha,
    sms,
    rateLimit: {
      reserve: () => Promise.reject(new Error("redis")),
      release: () => Promise.resolve({ ok: true as const }),
    },
  };
}

describe("buyer registration while purchase is disabled", () => {
  it("does not call captcha or SMS before returning purchase_disabled", async () => {
    const flow = closedFlow();
    const result = await requestBuyerSms(flow, {
      phone: "13900000000",
      captchaVerifyParam: "param",
    });
    expect(result).toMatchObject({ ok: false, error: "purchase_disabled" });
    expect(flow.captcha.calls).toEqual([]);
    expect(flow.sms.sendCalls).toEqual([]);
  });

  it("does not check an SMS code", async () => {
    const flow = closedFlow();
    const result = await checkBuyerSms(flow, { phone: "13900000000", code: "246810" });
    expect(result).toMatchObject({ ok: false, error: "purchase_disabled" });
    expect(flow.sms.checkCalls).toEqual([]);
    expect(flow.captcha.calls).toEqual([]);
  });

  it("does not complete registration", async () => {
    const flow = closedFlow();
    const result = await completeBuyerRegistration(flow, {
      phone: "13900000000",
      password: "stored-password",
    });
    expect(result).toMatchObject({ ok: false, error: "purchase_disabled" });
    expect(flow.sms.sendCalls).toEqual([]);
    expect(flow.captcha.calls).toEqual([]);
  });

  it("does not verify a password", async () => {
    const flow = closedFlow();
    const result = await loginBuyerWithPassword(flow, {
      phone: "13900000000",
      password: "stored-password",
    });
    expect(result).toMatchObject({ ok: false, error: "purchase_disabled" });
    expect(flow.sms.checkCalls).toEqual([]);
    expect(flow.captcha.calls).toEqual([]);
  });
});
