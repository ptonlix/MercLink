import { describe, expect, it } from "vitest";
import {
  createDevPaymentPort,
  devPaidNotification,
  resetDevPayments,
} from "../adapters/dev/payment";
import { createDevSms } from "../adapters/dev/sms";
import { devPaymentToken, devSmsCode, devStubFlag } from "./dev-stubs";
import { loadEnv, requiredEnvKeys } from "./env";

function filledEnv(): Record<string, string> {
  return Object.fromEntries(requiredEnvKeys.map((key) => [key, `value-${key}`]));
}

describe("development stubs", () => {
  it("keeps vendor credentials required unless the flag is set outside production", () => {
    const source = filledEnv();
    delete source.ALIPAY_PRIVATE_KEY;
    expect(loadEnv(source).ok).toBe(false);

    const development = { ...source, NODE_ENV: "development", [devStubFlag]: "1" };
    const loaded = loadEnv(development);
    expect(loaded.ok).toBe(true);
    expect(loadEnv({ ...development, NODE_ENV: "test" }).ok).toBe(false);

    const production = { ...filledEnv(), NODE_ENV: "production", [devStubFlag]: "1" };
    const blocked = loadEnv(production);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.message).toContain("NODE_ENV=production");
    }
  });

  it("accepts only the fixed SMS code and does not call a provider", async () => {
    const sms = createDevSms();
    await expect(sms.sendCode({ phone: "13800138000" })).resolves.toEqual({ ok: true });
    await expect(sms.checkCode({ phone: "13800138000", code: devSmsCode })).resolves.toEqual({
      ok: true,
    });
    await expect(sms.checkCode({ phone: "13800138000", code: "000000" })).resolves.toEqual({
      ok: false,
      message: "验证码不正确。",
    });
  });

  it("returns a local payment page and ignores an unsigned paid notification", async () => {
    resetDevPayments();
    const payment = createDevPaymentPort({
      appBaseUrl: "http://127.0.0.1:3000",
      signingSecret: "signing-secret",
    });
    const created = await payment.createPayment({
      paymentId: "pay_dev",
      orderId: "ord_dev",
      amount: 159900 as never,
      currency: "CNY",
      subject: "鞋",
    });
    expect(created).toEqual({
      ok: true,
      action: "http://127.0.0.1:3000/dev/pay/pay_dev",
      providerTradeNo: "dev_pay_dev",
    });

    const forged = await payment.verifyNotification({
      body: devPaidNotification({
        paymentId: "pay_dev",
        providerTradeNo: "dev_pay_dev",
        token: "nope",
      }),
      headers: {},
    });
    expect(forged.ok).toBe(false);

    const signed = await payment.verifyNotification({
      body: devPaidNotification({
        paymentId: "pay_dev",
        providerTradeNo: "dev_pay_dev",
        token: devPaymentToken("signing-secret", "pay_dev", "paid"),
      }),
      headers: {},
    });
    expect(signed).toMatchObject({ ok: true, status: "paid", paymentId: "pay_dev" });
    await expect(
      payment.queryPayment({ paymentId: "pay_dev", providerTradeNo: "dev_pay_dev" }),
    ).resolves.toMatchObject({ ok: true, status: "paid" });
  });
});
