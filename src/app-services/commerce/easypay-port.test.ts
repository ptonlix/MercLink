import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { createEasyPayPaymentPort, type EasyPayHttp } from "../../adapters/easypay";
import { easyPaySign } from "../../adapters/easypay/sign";
import { createDevEasyPayPort, resetDevEasyPay } from "../../adapters/dev/easypay";
import { minorUnits, minorUnitsFromYuan } from "../../shared/money";

const config = {
  pid: "1001",
  key: "merchant-key",
  apiBase: "https://pay.example/submit",
  notifyUrl: "https://merclink.example/api/v1/payments/easypay/notify",
};

describe("easypay adapter", () => {
  it("creates, queries, verifies, and refunds through injected HTTP", async () => {
    const calls: { url: string; body: string }[] = [];
    const http: EasyPayHttp = (input) => {
      calls.push(input);
      expect(input.url).not.toContain("merchant-key");
      if (input.url.endsWith("/mapi.php")) {
        const params = new URLSearchParams(input.body);
        expect(params.get("out_trade_no")).toBe("pay_001");
        expect(params.get("device")).toBe("pc");
        expect(params.get("type")).toBe("alipay");
        expect(params.get("money")).toBe("12.34");
        expect(params.get("clientip")).toBe("203.0.113.10");
        expect(params.get("key")).toBeNull();
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({
            code: 1,
            trade_no: "easy_1",
            payurl: "https://pay.example/cashier/1",
            qrcode: "https://pay.example/qr.png",
            urlscheme: "alipays://platformapi/startapp",
          }),
        });
      }
      if (input.url.endsWith("/api.php?act=order")) {
        const params = new URLSearchParams(input.body);
        expect(params.get("key")).toBe("merchant-key");
        expect(input.url).not.toContain("key=");
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({ code: 1, status: 0, trade_no: "easy_1", money: "12.34" }),
        });
      }
      const params = new URLSearchParams(input.body);
      expect(params.get("money")).toBe("12.34");
      expect(params.get("key")).toBe("merchant-key");
      expect(input.url).not.toContain("merchant-key");
      return Promise.resolve({ status: 200, body: JSON.stringify({ code: 1 }) });
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    try {
      const port = createEasyPayPaymentPort({ ...config, http });
      const created = await port.createPayment({
        paymentId: "pay_001",
        orderId: "ord_1",
        amount: minorUnits(1234),
        currency: "CNY",
        subject: "Shoe",
        channel: "desktop",
        clientAddress: "203.0.113.10",
      });
      expect(created).toEqual({
        ok: true,
        action: "https://pay.example/cashier/1",
        providerTradeNo: "easy_1",
      });
      await expect(
        port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
      ).resolves.toEqual({
        ok: true,
        status: "pending",
        providerTradeNo: "easy_1",
        amount: null,
      });
      await expect(
        port.cancelPayment({ paymentId: "pay_001", providerTradeNo: null }),
      ).resolves.toEqual({
        ok: false,
        outcome: "unsupported",
      });
      await expect(
        port.refundPayment({
          paymentId: "pay_001",
          providerTradeNo: "easy_1",
          amount: minorUnits(1234),
        }),
      ).resolves.toEqual({ ok: true });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("prefers mobile payurl2 and rejects QR-only, image, and alipays links", async () => {
    const responses = [
      { payurl: "https://pay.example/desk", payurl2: "https://pay.example/phone" },
      { qrcode: "https://pay.example/qr.png", urlscheme: "alipays://platformapi/startapp" },
      { payurl: "https://pay.example/qr.png" },
      { payurl: "alipays://platformapi/startapp" },
    ];
    let index = 0;
    const http: EasyPayHttp = () =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({ code: 1, trade_no: "easy_m", ...responses[index++] }),
      });
    const port = createEasyPayPaymentPort({ ...config, http });
    const input = {
      paymentId: "pay_m",
      orderId: "ord_m",
      amount: minorUnits(100),
      currency: "CNY",
      subject: "Shoe",
      channel: "mobile" as const,
      clientAddress: "203.0.113.8",
    };
    await expect(port.createPayment(input)).resolves.toMatchObject({
      ok: true,
      action: "https://pay.example/phone",
    });
    await expect(port.createPayment({ ...input, paymentId: "pay_qr" })).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    await expect(port.createPayment({ ...input, paymentId: "pay_img" })).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
    await expect(port.createPayment({ ...input, paymentId: "pay_scheme" })).resolves.toMatchObject({
      ok: false,
      error: "payment_retryable",
    });
  });

  it("rejects unknown notify fields and a bad signature without using the network", async () => {
    const port = createEasyPayPaymentPort({
      ...config,
      http: () => Promise.reject(new Error("network")),
    });
    const fields = {
      pid: "1001",
      trade_no: "easy_1",
      out_trade_no: "pay_001",
      type: "alipay",
      name: "Shoe",
      money: "12.34",
      trade_status: "TRADE_SUCCESS",
      sign_type: "MD5",
    };
    const signed = new URLSearchParams({ ...fields, sign: easyPaySign(fields, config.key) });
    await expect(
      port.verifyNotification({ body: signed.toString(), headers: {} }),
    ).resolves.toEqual({
      ok: true,
      status: "paid",
      providerTradeNo: "easy_1",
      paymentId: "pay_001",
      amount: minorUnits(1234),
    });
    signed.set("extra", "1");
    await expect(
      port.verifyNotification({ body: signed.toString(), headers: {} }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_signature" });
    const tampered = new URLSearchParams({ ...fields, sign: "0".repeat(32) });
    await expect(
      port.verifyNotification({ body: tampered.toString(), headers: {} }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_signature" });
  });

  it("treats only explicit unpaid or an exact missing order as unpaid", async () => {
    const responses = [
      { code: -1, msg: "商户不存在" },
      { code: -1, msg: "签名不存在" },
      { code: -1, msg: "订单不存在" },
      { code: 1, status: 1, trade_no: "easy_paid", money: "10" },
      { code: 1, status: 1, trade_no: "easy_paid", money: "10.5" },
      { code: 1, status: 1, trade_no: "easy_paid", money: "10.50" },
      { code: 1, status: 1, trade_no: "easy_paid", money: "10.500" },
      { code: 1, status: 1, trade_no: "easy_paid", money: "not-money" },
    ];
    let index = 0;
    const http: EasyPayHttp = () =>
      Promise.resolve({ status: 200, body: JSON.stringify(responses[index++]) });
    const port = createEasyPayPaymentPort({ ...config, http });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: false, error: "payment_retryable" });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: false, error: "payment_retryable" });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "pending" });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "paid", amount: minorUnits(1000) });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "paid", amount: minorUnits(1050) });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "paid", amount: minorUnits(1050) });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "paid", amount: null });
    await expect(
      port.queryPayment({ paymentId: "pay_001", providerTradeNo: null }),
    ).resolves.toMatchObject({ ok: true, status: "paid", amount: null });
    expect(minorUnitsFromYuan("10")).toEqual(minorUnits(1000));
    expect(minorUnitsFromYuan("10.5")).toEqual(minorUnits(1050));
    expect(minorUnitsFromYuan("10.50")).toEqual(minorUnits(1050));
    expect(minorUnitsFromYuan("10.500")).toBeNull();
    expect(minorUnitsFromYuan("abc")).toBeNull();
  });

  it("keeps vendor HTTP out of the commerce application services", async () => {
    const files = [
      "src/app-services/commerce/place-order.ts",
      "src/app-services/commerce/close-expired.ts",
      "src/app-services/commerce/notify-payment.ts",
      "src/app-services/commerce/payment-sync.ts",
      "src/app-services/commerce/resolve-receipt.ts",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/mapi\.php|adapters\/easypay|adapters\/alipay|node:http/);
    }
  });
});

describe("easypay development stub", () => {
  it("does not read a merchant key or call the network", async () => {
    resetDevEasyPay();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const previous = process.env.EASYPAY_KEY;
    delete process.env.EASYPAY_KEY;
    try {
      const port = createDevEasyPayPort({
        appBaseUrl: "http://127.0.0.1:3000",
        signingSecret: "signing-secret",
      });
      const created = await port.createPayment({
        paymentId: "pay_stub",
        orderId: "ord_stub",
        amount: minorUnits(100),
        currency: "CNY",
        subject: "Shoe",
        channel: "mobile",
      });
      expect(created).toMatchObject({
        ok: true,
        action: "https://127.0.0.1:3000/dev/pay/pay_stub?channel=mobile",
      });
      await expect(
        port.queryPayment({ paymentId: "pay_stub", providerTradeNo: null }),
      ).resolves.toMatchObject({ ok: true, status: "pending", amount: null });
      await expect(
        port.cancelPayment({ paymentId: "pay_stub", providerTradeNo: null }),
      ).resolves.toEqual({ ok: false, outcome: "unsupported" });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(process.env.EASYPAY_KEY).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      if (previous === undefined) {
        delete process.env.EASYPAY_KEY;
      } else {
        process.env.EASYPAY_KEY = previous;
      }
    }
  });
});
