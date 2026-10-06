import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAlipayPaymentPort } from "../../adapters/alipay";
import {
  alipayMethods,
  extractJsonNode,
  parseForm,
  signRsa2,
  signedContent,
  verifyRsa2,
} from "../../adapters/alipay/sign";
import { minorUnits } from "../../shared/money";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const appId = "2014072300007148";
const now = new Date("2026-05-16T08:07:50.000Z");

describe("alipay adapter", () => {
  it("builds the documented page pay request and verifies trade status notifications", async () => {
    const calls: { url: string; body: string }[] = [];
    const port = createAlipayPaymentPort({
      appId,
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      notifyUrl: "https://merclink.example/api/v1/payments/alipay/notify",
      now: () => now,
      fetch: (url, init) => {
        const requestUrl =
          typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        const rawBody = init?.body;
        const body = typeof rawBody === "string" ? rawBody : "";
        calls.push({ url: requestUrl, body });
        const params = parseForm(body);
        const method = params.method;
        const nodeName =
          method === alipayMethods.query
            ? "alipay_trade_query_response"
            : "alipay_trade_close_response";
        const payload = {
          code: "10000",
          msg: "Success",
          trade_no: "2013112011001004330000121536",
          out_trade_no: "pay_1",
          trade_status: "TRADE_SUCCESS",
        };
        const node = JSON.stringify(payload);
        const signature = signRsa2(node, keys.privateKey);
        const raw = `{"${nodeName}":${node},"sign":"${signature}"}`;
        return Promise.resolve(new Response(raw, { status: 200 }));
      },
    });

    const created = await port.createPayment({
      paymentId: "pay_001",
      orderId: "ord_1",
      amount: minorUnits(159900),
      currency: "CNY",
      subject: "Shoe/42",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.providerTradeNo).toBeNull();
    expect(created.action).toEqual(expect.stringContaining("method=alipay.trade.page.pay"));
    const action = String(created.action);
    const query = new URL(action).searchParams;
    expect(query.get("method")).toBe(alipayMethods.create);
    const biz = JSON.parse(query.get("biz_content") ?? "{}") as Record<string, string>;
    expect(biz).toEqual({
      out_trade_no: "pay_001",
      total_amount: "1599.00",
      subject: "Shoe42",
      product_code: "FAST_INSTANT_TRADE_PAY",
    });
    expect(query.get("notify_url")).toBe("https://merclink.example/api/v1/payments/alipay/notify");
    const signed = parseForm(action.slice(action.indexOf("?") + 1));
    expect(
      verifyRsa2(
        signedContent(signed, { exclude: ["sign"], skipEmpty: true }),
        signed.sign ?? "",
        keys.publicKey,
      ),
    ).toBe(true);

    const queried = await port.queryPayment({ paymentId: "pay_001", providerTradeNo: null });
    expect(queried).toEqual({
      ok: true,
      status: "paid",
      providerTradeNo: "2013112011001004330000121536",
    });
    const queryBody = parseForm(calls[0]?.body ?? "");
    expect(queryBody.method).toBe(alipayMethods.query);
    expect(JSON.parse(queryBody.biz_content ?? "{}")).toEqual({ out_trade_no: "pay_001" });

    const closed = await port.cancelPayment({ paymentId: "pay_001", providerTradeNo: "trade_1" });
    expect(closed).toEqual({ ok: true });
    expect(parseForm(calls[1]?.body ?? "").method).toBe(alipayMethods.close);

    const notify = formNotify({
      app_id: appId,
      trade_status: "TRADE_SUCCESS",
      trade_no: "2013112011001004330000121536",
      out_trade_no: "pay_001",
      notify_type: "trade_status_sync",
    });
    await expect(port.verifyNotification({ body: notify, headers: {} })).resolves.toEqual({
      ok: true,
      status: "paid",
      providerTradeNo: "2013112011001004330000121536",
      paymentId: "pay_001",
    });
    const tampered = notify.replace("TRADE_SUCCESS", "TRADE_CLOSED");
    await expect(port.verifyNotification({ body: tampered, headers: {} })).resolves.toMatchObject({
      ok: false,
      error: "invalid_signature",
    });

    const wrongCurrency = await port.createPayment({
      paymentId: "pay_002",
      orderId: "ord_2",
      amount: minorUnits(100),
      currency: "USD",
      subject: "Shoe",
    });
    expect(wrongCurrency).toMatchObject({ ok: false, error: "payment_retryable" });
    expect(
      extractJsonNode(`{"alipay_trade_query_response":{"code":"10000"}}`, "missing"),
    ).toBeNull();
  });
});

function formNotify(fields: Record<string, string>): string {
  const content = signedContent(fields, { exclude: ["sign", "sign_type"], skipEmpty: false });
  const sign = signRsa2(content, keys.privateKey);
  const params = new URLSearchParams({ ...fields, sign, sign_type: "RSA2" });
  return params.toString();
}
