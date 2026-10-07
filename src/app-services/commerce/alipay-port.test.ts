import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAlipayPaymentPort,
  createAlipaySdk,
  type AlipayOpenApi,
} from "../../adapters/alipay";
import { alipayMethods, pagePayBizContent } from "../../adapters/alipay/sign";
import { minorUnits } from "../../shared/money";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const appId = "2014072300007148";

describe("alipay adapter", () => {
  it("uses the official SDK for page pay, query, close, and notification checks", async () => {
    const calls: string[] = [];
    const client: AlipayOpenApi = {
      pageExecute: (method, httpMethod, params) => {
        calls.push(method);
        expect(httpMethod).toBe("GET");
        expect(params.notifyUrl).toBe("https://merclink.example/api/v1/payments/alipay/notify");
        expect(params.bizContent).toEqual({
          out_trade_no: "pay_001",
          total_amount: "1599.00",
          subject: "Shoe42",
          product_code: "FAST_INSTANT_TRADE_PAY",
        });
        return `https://openapi.alipay.com/gateway.do?method=${method}`;
      },
      exec: (method) => {
        calls.push(method);
        return Promise.resolve({
          code: "10000",
          tradeStatus: "TRADE_SUCCESS",
          tradeNo: "2013112011001004330000121536",
        });
      },
      checkNotifySign: (postData) => postData.trade_status === "TRADE_SUCCESS",
    };
    const port = createAlipayPaymentPort({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
      client,
    });

    const created = await port.createPayment({
      paymentId: "pay_001",
      orderId: "ord_1",
      amount: minorUnits(159900),
      currency: "CNY",
      subject: "Shoe/42",
    });
    expect(created).toMatchObject({
      ok: true,
      action: "https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay",
      providerTradeNo: null,
    });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toEqual({
      ok: true,
      status: "paid",
      providerTradeNo: "2013112011001004330000121536",
    });
    await expect(
      port.cancelPayment({ paymentId: "pay_001", providerTradeNo: "trade_1" }),
    ).resolves.toEqual({ ok: true });
    await expect(
      port.verifyNotification({
        body: "app_id=2014072300007148&trade_status=TRADE_SUCCESS&trade_no=2013112011001004330000121536&out_trade_no=pay_001",
        headers: {},
      }),
    ).resolves.toMatchObject({ ok: true, status: "paid" });
    await expect(
      port.verifyNotification({
        body: "app_id=2014072300007148&trade_status=TRADE_CLOSED&trade_no=1&out_trade_no=pay_001",
        headers: {},
      }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_signature" });
    expect(calls).toEqual([alipayMethods.create, alipayMethods.query, alipayMethods.close]);
    expect(
      pagePayBizContent({ paymentId: "pay_001", amount: minorUnits(159900), subject: "Shoe/42" }),
    ).toContain("FAST_INSTANT_TRADE_PAY");
  });

  it("builds a domestic payment link with the official SDK and refuses an unverified Alipay+ contract", async () => {
    const sdk = createAlipaySdk({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
    });
    const action = sdk.pageExecute(alipayMethods.create, "GET", {
      bizContent: {
        out_trade_no: "pay_001",
        total_amount: "1599.00",
        subject: "Shoe42",
        product_code: "FAST_INSTANT_TRADE_PAY",
      },
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
    });
    expect(action).toContain("method=alipay.trade.page.pay");
    expect(action).not.toContain(keys.privateKey);

    const international = createAlipayPaymentPort({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/notify",
      product: "alipayplus",
    });
    await expect(
      international.createPayment({
        paymentId: "pay_002",
        orderId: "ord_2",
        amount: minorUnits(100),
        currency: "USD",
        subject: "Shoe",
      }),
    ).resolves.toMatchObject({ ok: false, error: "payment_retryable" });
  });
});
