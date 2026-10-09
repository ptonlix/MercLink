import { generateKeyPairSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAlipayPaymentPort,
  createAlipaySdk,
  type AlipayOpenApi,
} from "../../adapters/alipay";
import { alipayMethods, pagePayBizContent } from "../../adapters/alipay/sign";
import { apiRoutes } from "../../shared/api-routes";
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
      channel: "desktop",
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
      amount: null,
    });
    await expect(
      port.cancelPayment({ paymentId: "pay_001", providerTradeNo: "trade_1" }),
    ).resolves.toEqual({ ok: true, outcome: "closed" });
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
      pagePayBizContent({
        paymentId: "pay_001",
        amount: minorUnits(159900),
        subject: "Shoe/42",
        channel: "desktop",
      }),
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
        channel: "desktop",
      }),
    ).resolves.toMatchObject({ ok: false, error: "payment_retryable" });
    await expect(
      international.createPayment({
        paymentId: "pay_003",
        orderId: "ord_3",
        amount: minorUnits(100),
        currency: "CNY",
        subject: "Shoe",
        channel: "mobile",
      }),
    ).resolves.toMatchObject({ ok: false, error: "payment_retryable" });
  });

  it("uses wap pay for a stored mobile channel and keeps query, close, and notify on one path", async () => {
    const calls: string[] = [];
    const client: AlipayOpenApi = {
      pageExecute: (method, httpMethod, params) => {
        calls.push(method);
        expect(httpMethod).toBe("GET");
        expect(params.notifyUrl).toBe("https://merclink.example/api/v1/payments/alipay/notify");
        expect(params.bizContent).toEqual({
          out_trade_no: "pay_m",
          total_amount: "12.00",
          subject: "Shoe",
          product_code: "QUICK_WAP_WAY",
        });
        expect(params.bizContent).not.toHaveProperty("return_url");
        expect(params.bizContent).not.toHaveProperty("quit_url");
        return `https://openapi.alipay.com/gateway.do?method=${method}`;
      },
      exec: (method) => {
        calls.push(method);
        return Promise.resolve({ code: "10000", tradeStatus: "WAIT_BUYER_PAY", tradeNo: "t_m" });
      },
      checkNotifySign: () => true,
    };
    const port = createAlipayPaymentPort({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
      client,
    });
    const created = await port.createPayment({
      paymentId: "pay_m",
      orderId: "ord_m",
      amount: minorUnits(1200),
      currency: "CNY",
      subject: "Shoe",
      channel: "mobile",
    });
    expect(created).toMatchObject({
      ok: true,
      action: "https://openapi.alipay.com/gateway.do?method=alipay.trade.wap.pay",
    });
    if (created.ok) {
      expect(created.action).toMatch(/^https:\/\//);
      expect(String(created.action)).not.toContain("alipays://");
    }
    await expect(
      port.queryPayment({ paymentId: "pay_m", providerTradeNo: null }),
    ).resolves.toMatchObject({
      ok: true,
      status: "pending",
    });
    await expect(
      port.cancelPayment({ paymentId: "pay_m", providerTradeNo: null }),
    ).resolves.toEqual({
      ok: true,
      outcome: "closed",
    });
    await expect(
      port.verifyNotification({
        body: "app_id=2014072300007148&trade_status=TRADE_SUCCESS&trade_no=t_m&out_trade_no=pay_m&total_amount=10",
        headers: {},
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: "paid",
      paymentId: "pay_m",
      amount: minorUnits(1000),
    });
    await expect(
      port.verifyNotification({
        body: "app_id=2014072300007148&trade_status=TRADE_SUCCESS&trade_no=t_m&out_trade_no=pay_m&total_amount=10.5",
        headers: {},
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: "paid",
      paymentId: "pay_m",
      amount: minorUnits(1050),
    });
    expect(calls).toEqual([alipayMethods.createMobile, alipayMethods.query, alipayMethods.close]);
    expect(calls).not.toContain(alipayMethods.create);

    const sdk = createAlipaySdk({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
    });
    const signed = sdk.pageExecute(alipayMethods.createMobile, "GET", {
      bizContent: {
        out_trade_no: "pay_m",
        total_amount: "12.00",
        subject: "Shoe",
        product_code: "QUICK_WAP_WAY",
      },
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
    });
    expect(signed.startsWith("https://")).toBe(true);
    expect(signed).toContain("method=alipay.trade.wap.pay");
    expect(signed).toContain("QUICK_WAP_WAY");
    expect(signed).not.toContain(keys.privateKey);

    const routes = await walk("src/app/api/v1/payments");
    expect(routes.filter((file) => file.endsWith("route.ts")).sort()).toEqual([
      "src/app/api/v1/payments/alipay/notify/route.ts",
      "src/app/api/v1/payments/easypay/notify/route.ts",
    ]);
    const notify = await readFile("src/app/api/v1/payments/alipay/notify/route.ts", "utf8");
    expect(notify).toContain("applyPaymentNotification");
    expect(notify).toContain('provider: "alipay"');
    expect(notify).not.toContain("wap");
    expect(notify).not.toContain("channel");
    expect(
      apiRoutes.filter((route) => route.path.includes("/alipay/notify")).map((route) => route.path),
    ).toEqual(["/api/v1/payments/alipay/notify"]);
  });

  it("keeps gateway rejection retryable and does not switch to the other method", async () => {
    const calls: string[] = [];
    let action = "alipays://platformapi/startapp";
    const client: AlipayOpenApi = {
      pageExecute: (method) => {
        calls.push(method);
        if (action === "throw") {
          throw new Error("ACQ.ACCESS_FORBIDDEN");
        }
        return action;
      },
      exec: (method) => {
        calls.push(method);
        return Promise.resolve({ code: "10000" });
      },
      checkNotifySign: () => true,
    };
    const port = createAlipayPaymentPort({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
      client,
    });
    const input = {
      paymentId: "pay_bad",
      orderId: "ord_bad",
      amount: minorUnits(100),
      currency: "CNY",
      subject: "Shoe",
      channel: "mobile" as const,
    };
    await expect(port.createPayment(input)).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    action = '<form action="https://openapi.alipay.com"></form>';
    await expect(port.createPayment(input)).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    action = "http://openapi.alipay.com/gateway.do?method=alipay.trade.wap.pay";
    await expect(port.createPayment(input)).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    action = "throw";
    await expect(port.createPayment(input)).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    expect(calls).toEqual([
      alipayMethods.createMobile,
      alipayMethods.createMobile,
      alipayMethods.createMobile,
      alipayMethods.createMobile,
    ]);
    expect(calls).not.toContain(alipayMethods.create);
    expect(calls).not.toContain(alipayMethods.query);
    expect(calls).not.toContain(alipayMethods.close);
  });
});

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return nested.flat();
}
