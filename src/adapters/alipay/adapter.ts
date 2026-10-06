import type {
  CancelPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentPort,
  PaymentViewStatus,
  QueryPaymentResult,
  VerifyNotificationResult,
} from "../../ports/payment";
import {
  alipayGateway,
  alipayMethods,
  buildSignedParams,
  extractJsonNode,
  extractResponseSign,
  pagePayBizContent,
  parseForm,
  signedContent,
  toFormBody,
  verifyRsa2,
} from "./sign";

type AlipayAdapterConfig = {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  notifyUrl: string;
  gateway?: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

const retryable = (
  message: string,
): { ok: false; error: "payment_retryable"; message: string } => ({
  ok: false,
  error: "payment_retryable",
  message,
});

const unavailable = {
  ok: false as const,
  error: "dependency_unavailable" as const,
  message: "支付网关不可用。",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function viewStatus(tradeStatus: string): PaymentViewStatus | null {
  if (tradeStatus === "WAIT_BUYER_PAY") {
    return "pending";
  }
  if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
    return "paid";
  }
  if (tradeStatus === "TRADE_CLOSED") {
    return "closed";
  }
  return null;
}

export function createAlipayPaymentPort(config: AlipayAdapterConfig): PaymentPort {
  const gateway = config.gateway ?? alipayGateway;
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  const now = config.now ?? ((): Date => new Date());

  return {
    createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      if (input.currency !== "CNY") {
        return Promise.resolve(retryable("当前支付只接受 CNY。"));
      }
      const bizContent = pagePayBizContent({
        paymentId: input.paymentId,
        amount: input.amount,
        subject: input.subject,
      });
      if (bizContent === null) {
        return Promise.resolve(retryable("支付创建失败，请重试。"));
      }
      try {
        const params = buildSignedParams({
          appId: config.appId,
          method: alipayMethods.create,
          bizContent,
          notifyUrl: config.notifyUrl,
          privateKey: config.privateKey,
          now: now(),
        });
        return Promise.resolve({
          ok: true,
          action: `${gateway}?${toFormBody(params)}`,
          providerTradeNo: null,
        });
      } catch {
        return Promise.resolve(retryable("支付创建失败，请重试。"));
      }
    },

    async queryPayment(input): Promise<QueryPaymentResult> {
      const biz: Record<string, string> = { out_trade_no: input.paymentId };
      if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
        biz.trade_no = input.providerTradeNo;
      }
      const executed = await execute(config, fetchImpl, gateway, alipayMethods.query, biz, now());
      if (!executed.ok) {
        return executed;
      }
      const node = verifiedNode(
        executed.raw,
        "alipay_trade_query_response",
        config.alipayPublicKey,
      );
      if (!isRecord(node)) {
        return retryable("支付查询失败，请重试。");
      }
      const code = readString(node, "code");
      if (code === "10000") {
        const tradeStatus = readString(node, "trade_status");
        const status = tradeStatus === null ? null : viewStatus(tradeStatus);
        if (status === null) {
          return retryable("支付查询失败，请重试。");
        }
        return {
          ok: true,
          status,
          providerTradeNo: readString(node, "trade_no"),
        };
      }
      if (readString(node, "sub_code") === "ACQ.TRADE_NOT_EXIST") {
        return { ok: true, status: "pending", providerTradeNo: null };
      }
      return retryable("支付查询失败，请重试。");
    },

    async cancelPayment(input): Promise<CancelPaymentResult> {
      const biz: Record<string, string> = { out_trade_no: input.paymentId };
      if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
        biz.trade_no = input.providerTradeNo;
      }
      const executed = await execute(config, fetchImpl, gateway, alipayMethods.close, biz, now());
      if (!executed.ok) {
        return retryable(executed.message);
      }
      const node = verifiedNode(
        executed.raw,
        "alipay_trade_close_response",
        config.alipayPublicKey,
      );
      if (!isRecord(node)) {
        return retryable("支付取消失败，请重试。");
      }
      const code = readString(node, "code");
      const subCode = readString(node, "sub_code");
      if (code === "10000" || subCode === "ACQ.TRADE_NOT_EXIST") {
        return { ok: true };
      }
      return retryable("支付取消失败，请重试。");
    },

    verifyNotification(input): Promise<VerifyNotificationResult> {
      const params = parseForm(input.body);
      const signature = params.sign;
      if (signature === undefined || signature === "") {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "通知验签失败。",
        });
      }
      const content = signedContent(params, {
        exclude: ["sign", "sign_type"],
        skipEmpty: false,
      });
      if (!verifyRsa2(content, signature, config.alipayPublicKey)) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "通知验签失败。",
        });
      }
      if (params.app_id !== config.appId) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "通知验签失败。",
        });
      }
      const tradeStatus = params.trade_status;
      const providerTradeNo = params.trade_no;
      const paymentId = params.out_trade_no;
      if (tradeStatus === undefined || providerTradeNo === undefined || paymentId === undefined) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "通知验签失败。",
        });
      }
      const status = viewStatus(tradeStatus);
      if (status === null) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "通知验签失败。",
        });
      }
      return Promise.resolve({
        ok: true,
        status,
        providerTradeNo,
        paymentId,
      });
    },
  };
}

async function execute(
  config: AlipayAdapterConfig,
  fetchImpl: typeof fetch,
  gateway: string,
  method: string,
  biz: Readonly<Record<string, string>>,
  now: Date,
): Promise<
  | { ok: true; raw: string }
  | { ok: false; error: "payment_retryable" | "dependency_unavailable"; message: string }
> {
  let body = "";
  try {
    const params = buildSignedParams({
      appId: config.appId,
      method,
      bizContent: JSON.stringify(biz),
      privateKey: config.privateKey,
      now,
    });
    body = toFormBody(params);
  } catch {
    return retryable("支付请求签名失败，请重试。");
  }
  try {
    const response = await fetchImpl(gateway, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    const raw = await response.text();
    if (!response.ok) {
      return unavailable;
    }
    return { ok: true, raw };
  } catch {
    return unavailable;
  }
}

function verifiedNode(raw: string, nodeName: string, publicKey: string): unknown {
  const node = extractJsonNode(raw, nodeName);
  const signature = extractResponseSign(raw);
  if (node === null || signature === null || !verifyRsa2(node, signature, publicKey)) {
    return null;
  }
  try {
    return JSON.parse(node) as unknown;
  } catch {
    return null;
  }
}
