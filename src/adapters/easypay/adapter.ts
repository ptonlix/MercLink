import type {
  CancelPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentChannel,
  PaymentPort,
  PaymentRefundPort,
  QueryPaymentResult,
  VerifyNotificationResult,
} from "../../ports/payment";
import { minorUnitsFromYuan } from "../../shared/money";
import {
  easyPaySign,
  isAbsoluteHttpsUrl,
  parseNotifyParams,
  payableHttpsUrl,
  signaturesMatch,
  yuanFromMinor,
} from "./sign";

export type EasyPayHttp = (input: {
  url: string;
  body: string;
}) => Promise<{ status: number; body: string }>;

export type EasyPayAdapterConfig = {
  pid: string;
  key: string;
  apiBase: string;
  notifyUrl: string;
  http?: EasyPayHttp;
};

const retryable = (
  message: string,
): { ok: false; error: "payment_retryable"; message: string } => ({
  ok: false,
  error: "payment_retryable",
  message,
});

const invalidSignature = {
  ok: false as const,
  error: "invalid_signature" as const,
  message: "通知验签失败。",
};

export function createEasyPayPaymentPort(
  config: EasyPayAdapterConfig,
): PaymentPort & PaymentRefundPort {
  const http = config.http ?? fetchForm;

  return {
    upstreamClose: "unsupported",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      if (input.currency !== "CNY") {
        return retryable("当前支付只接受 CNY。");
      }
      const money = yuanFromMinor(input.amount);
      const clientip = input.clientAddress ?? "";
      if (money === null || clientip.trim() === "" || !isAbsoluteHttpsUrl(config.notifyUrl)) {
        return retryable("支付创建失败，请重试。");
      }
      const params: Record<string, string> = {
        pid: config.pid,
        type: "alipay",
        out_trade_no: input.paymentId,
        notify_url: config.notifyUrl,
        name: sanitizeSubject(input.subject),
        money,
        clientip,
        device: deviceFor(input.channel),
        sign_type: "MD5",
      };
      params.sign = easyPaySign(params, config.key);
      try {
        const response = await http({
          url: endpoint(config.apiBase, "/mapi.php"),
          body: new URLSearchParams(params).toString(),
        });
        if (response.status < 200 || response.status >= 300) {
          return retryable("支付创建失败，请重试。");
        }
        const payload = parseJson(response.body);
        if (payload === null || !codeOk(payload)) {
          return retryable("支付创建失败，请重试。");
        }
        const action = selectPayUrl(input.channel, payload);
        if (action === null) {
          return retryable("支付创建失败，请重试。");
        }
        return {
          ok: true,
          action,
          providerTradeNo: readString(payload, "trade_no"),
        };
      } catch {
        return retryable("支付创建失败，请重试。");
      }
    },

    async queryPayment(input): Promise<QueryPaymentResult> {
      const params = signedKeyBody(config, { out_trade_no: input.paymentId });
      try {
        const response = await http({
          url: endpoint(config.apiBase, "/api.php?act=order"),
          body: new URLSearchParams(params).toString(),
        });
        if (response.status < 200 || response.status >= 300) {
          return retryable("支付查询失败，请重试。");
        }
        const payload = parseJson(response.body);
        if (payload === null) {
          return retryable("支付查询失败，请重试。");
        }
        return mapQuery(payload, input.providerTradeNo);
      } catch {
        return retryable("支付查询失败，请重试。");
      }
    },

    cancelPayment(): Promise<CancelPaymentResult> {
      return Promise.resolve({ ok: false, outcome: "unsupported" });
    },

    verifyNotification(input): Promise<VerifyNotificationResult> {
      const params = parseNotifyParams(input.body);
      if (params === null) {
        return Promise.resolve(invalidSignature);
      }
      const sign = params.sign;
      if (sign === undefined || params.pid !== config.pid) {
        return Promise.resolve(invalidSignature);
      }
      const expected = easyPaySign(params, config.key);
      if (!signaturesMatch(expected, sign)) {
        return Promise.resolve(invalidSignature);
      }
      const paymentId = params.out_trade_no ?? null;
      const providerTradeNo = params.trade_no;
      if (providerTradeNo === undefined || providerTradeNo.length === 0) {
        return Promise.resolve(invalidSignature);
      }
      const amount = params.money === undefined ? null : minorUnitsFromYuan(params.money);
      const status = params.trade_status === "TRADE_SUCCESS" ? "paid" : "pending";
      if (status === "paid" && amount === null) {
        return Promise.resolve(invalidSignature);
      }
      return Promise.resolve({
        ok: true,
        status,
        providerTradeNo,
        paymentId,
        amount,
      });
    },

    async refundPayment(input) {
      const money = yuanFromMinor(input.amount);
      if (money === null) {
        return retryable("退款失败，请重试。");
      }
      const fields: Record<string, string> = { money, out_trade_no: input.paymentId };
      if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
        fields.trade_no = input.providerTradeNo;
      }
      const params = signedKeyBody(config, fields);
      try {
        const response = await http({
          url: endpoint(config.apiBase, "/api.php?act=refund"),
          body: new URLSearchParams(params).toString(),
        });
        if (response.status < 200 || response.status >= 300) {
          return retryable("退款失败，请重试。");
        }
        const payload = parseJson(response.body);
        if (payload === null || !codeOk(payload)) {
          return retryable("退款失败，请重试。");
        }
        return { ok: true };
      } catch {
        return retryable("退款失败，请重试。");
      }
    },
  };
}

function deviceFor(channel: PaymentChannel): string {
  // EasyPay names the desktop device `pc`. Do not infer it from User-Agent.
  return channel === "mobile" ? "mobile" : "pc";
}

function selectPayUrl(channel: PaymentChannel, payload: Record<string, unknown>): string | null {
  const payurl = payableHttpsUrl(readString(payload, "payurl"));
  const payurl2 = payableHttpsUrl(readString(payload, "payurl2"));
  if (channel === "mobile" && payurl2 !== null) {
    return payurl2;
  }
  return payurl;
}

function mapQuery(
  payload: Record<string, unknown>,
  fallbackTradeNo: string | null,
): QueryPaymentResult {
  const providerTradeNo = readString(payload, "trade_no") ?? fallbackTradeNo;
  const amount = readAmount(payload);
  if (isPaidPayload(payload)) {
    return { ok: true, status: "paid", providerTradeNo, amount };
  }
  if (isUnpaidPayload(payload)) {
    return { ok: true, status: "pending", providerTradeNo, amount: null };
  }
  return retryable("支付查询失败，请重试。");
}

function isPaidPayload(payload: Record<string, unknown>): boolean {
  const status = payload.status;
  return payload.trade_status === "TRADE_SUCCESS" || status === 1 || status === "1";
}

function isUnpaidPayload(payload: Record<string, unknown>): boolean {
  if (isPaidPayload(payload)) {
    return false;
  }
  if (isExplicitlyUnpaid(payload) && !codeFailed(payload)) {
    return true;
  }
  const message = readString(payload, "msg") ?? "";
  return codeFailed(payload) && isOrderMissingMessage(message);
}

function isExplicitlyUnpaid(payload: Record<string, unknown>): boolean {
  const status = payload.status;
  return status === 0 || status === "0" || payload.trade_status === "WAIT_BUYER_PAY";
}

function codeFailed(payload: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(payload, "code")) {
    return false;
  }
  const code = payload.code;
  return code !== 1 && code !== "1";
}

function isOrderMissingMessage(message: string): boolean {
  const normalized = message
    .trim()
    .replace(/[.\u3002!\uff01]+$/u, "")
    .toLowerCase();
  return (
    normalized === "订单不存在" ||
    normalized === "订单号不存在" ||
    normalized === "order not exist" ||
    normalized === "order does not exist" ||
    normalized === "order not exists"
  );
}

function readAmount(payload: Record<string, unknown>): ReturnType<typeof minorUnitsFromYuan> {
  const money = payload.money;
  return typeof money === "string" ? minorUnitsFromYuan(money) : null;
}

function signedKeyBody(
  config: EasyPayAdapterConfig,
  fields: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    pid: config.pid,
    key: config.key,
    ...fields,
  };
}

function codeOk(payload: Record<string, unknown>): boolean {
  return payload.code === 1 || payload.code === "1";
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sanitizeSubject(subject: string): string {
  const cleaned = subject.replace(/[/=&]/g, "").replace(/\s+/g, " ").trim();
  const limited = cleaned.slice(0, 64);
  return limited.length > 0 ? limited : "order";
}

function endpoint(apiBase: string, path: string): string {
  const trimmed = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  return `${trimmed}${path}`;
}

async function fetchForm(input: {
  url: string;
  body: string;
}): Promise<{ status: number; body: string }> {
  const response = await fetch(input.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: input.body,
  });
  return { status: response.status, body: await response.text() };
}

function easypayCredentialReady(source: Readonly<Record<string, string | undefined>>): boolean {
  const pid = source.EASYPAY_PID;
  const key = source.EASYPAY_KEY;
  const apiBase = source.EASYPAY_API_BASE;
  const notifyUrl = source.EASYPAY_NOTIFY_URL;
  return (
    present(pid) &&
    present(key) &&
    present(apiBase) &&
    isAbsoluteHttpsUrl(apiBase) &&
    present(notifyUrl) &&
    isAbsoluteHttpsUrl(notifyUrl)
  );
}

export function readEasyPayConfig(
  source: Readonly<Record<string, string | undefined>>,
): EasyPayAdapterConfig | null {
  if (!easypayCredentialReady(source)) {
    return null;
  }
  return {
    pid: source.EASYPAY_PID ?? "",
    key: source.EASYPAY_KEY ?? "",
    apiBase: source.EASYPAY_API_BASE ?? "",
    notifyUrl: source.EASYPAY_NOTIFY_URL ?? "",
  };
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}
