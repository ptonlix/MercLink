import { AlipaySdk } from "alipay-sdk";
import type {
  CancelPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentPort,
  PaymentViewStatus,
  QueryPaymentResult,
  VerifyNotificationResult,
} from "../../ports/payment";
import { minorUnitsFromYuan } from "../../shared/money";
import { alipayGateway, alipayMethods, pagePayBizContent, parseForm } from "./sign";

type AlipayProduct = "domestic" | "alipayplus";

export type AlipayAdapterConfig = {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  notifyUrl: string;
  gateway?: string;
  product?: AlipayProduct;
  client?: AlipayOpenApi;
  now?: () => Date;
};

export type AlipayOpenApi = {
  pageExecute(
    method: string,
    httpMethod: "GET",
    params: { bizContent: Record<string, string>; notifyUrl: string },
  ): string;
  exec(
    method: string,
    params: { bizContent: Record<string, string> },
  ): Promise<Record<string, unknown>>;
  checkNotifySign(postData: Record<string, string>): boolean;
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

const internationalUnavailable = retryable("国际 Alipay+ 请求字段尚未进入平台合同。");

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
  if (config.product === "alipayplus") {
    return closedInternationalPort();
  }
  const client = config.client ?? createAlipaySdk(config);

  return {
    upstreamClose: "supported",

    createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      if (input.currency !== "CNY") {
        return Promise.resolve(retryable("当前支付只接受 CNY。"));
      }
      const bizContent = pagePayBizContent({
        paymentId: input.paymentId,
        amount: input.amount,
        subject: input.subject,
        channel: input.channel,
      });
      if (bizContent === null) {
        return Promise.resolve(retryable("支付创建失败，请重试。"));
      }
      const method = input.channel === "mobile" ? alipayMethods.createMobile : alipayMethods.create;
      try {
        const action = client.pageExecute(method, "GET", {
          bizContent: JSON.parse(bizContent) as Record<string, string>,
          notifyUrl: config.notifyUrl,
        });
        if (!isAbsoluteHttpsUrl(action)) {
          return Promise.resolve(retryable("支付创建失败，请重试。"));
        }
        return Promise.resolve({ ok: true, action, providerTradeNo: null });
      } catch {
        return Promise.resolve(retryable("支付创建失败，请重试。"));
      }
    },

    async queryPayment(input): Promise<QueryPaymentResult> {
      const biz: Record<string, string> = { out_trade_no: input.paymentId };
      if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
        biz.trade_no = input.providerTradeNo;
      }
      try {
        const result = await client.exec(alipayMethods.query, { bizContent: biz });
        const status = readString(result, "tradeStatus") ?? readString(result, "trade_status");
        const providerTradeNo =
          readString(result, "tradeNo") ?? readString(result, "trade_no") ?? input.providerTradeNo;
        const subCode = readString(result, "subCode") ?? readString(result, "sub_code");
        if (subCode === "ACQ.TRADE_NOT_EXIST") {
          return {
            ok: true,
            status: "pending",
            providerTradeNo,
            amount: null,
          };
        }
        const view = status === null ? null : viewStatus(status);
        if (view === null) {
          return retryable("支付查询失败，请重试。");
        }
        const amount = readAmount(result);
        return { ok: true, status: view, providerTradeNo, amount };
      } catch {
        return unavailable;
      }
    },

    async cancelPayment(input): Promise<CancelPaymentResult> {
      const biz: Record<string, string> = { out_trade_no: input.paymentId };
      if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
        biz.trade_no = input.providerTradeNo;
      }
      try {
        const result = await client.exec(alipayMethods.close, { bizContent: biz });
        const code = readString(result, "code");
        const subCode = readString(result, "subCode") ?? readString(result, "sub_code");
        if (code === "10000" || subCode === "ACQ.TRADE_NOT_EXIST") {
          return { ok: true, outcome: "closed" };
        }
        const queried = await queryTrade(client, input);
        if (queried.ok && queried.status === "paid") {
          return {
            ok: false,
            outcome: "already_paid",
            providerTradeNo: queried.providerTradeNo,
            amount: queried.amount,
          };
        }
        if (queried.ok && queried.status === "closed") {
          return { ok: true, outcome: "closed" };
        }
        return cancelRetryable();
      } catch {
        return cancelRetryable();
      }
    },

    verifyNotification(input): Promise<VerifyNotificationResult> {
      const params = parseForm(input.body);
      if (!client.checkNotifySign(params)) {
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
      const amount =
        params.total_amount === undefined ? null : minorUnitsFromYuan(params.total_amount);
      return Promise.resolve({ ok: true, status, providerTradeNo, paymentId, amount });
    },
  };
}

async function queryTrade(
  client: AlipayOpenApi,
  input: { paymentId: string; providerTradeNo: string | null },
): Promise<QueryPaymentResult> {
  const biz: Record<string, string> = { out_trade_no: input.paymentId };
  if (input.providerTradeNo !== null && input.providerTradeNo !== "") {
    biz.trade_no = input.providerTradeNo;
  }
  const result = await client.exec(alipayMethods.query, { bizContent: biz });
  const status = readString(result, "tradeStatus") ?? readString(result, "trade_status");
  const providerTradeNo =
    readString(result, "tradeNo") ?? readString(result, "trade_no") ?? input.providerTradeNo;
  const view = status === null ? null : viewStatus(status);
  if (view === null) {
    return retryable("支付查询失败，请重试。");
  }
  return { ok: true, status: view, providerTradeNo, amount: readAmount(result) };
}

function readAmount(record: Record<string, unknown>): ReturnType<typeof minorUnitsFromYuan> {
  const raw =
    readString(record, "totalAmount") ??
    readString(record, "total_amount") ??
    readString(record, "buyerPayAmount");
  return raw === null ? null : minorUnitsFromYuan(raw);
}

function cancelRetryable(): CancelPaymentResult {
  return {
    ok: false,
    outcome: "retryable",
    error: "payment_retryable",
    message: "支付取消失败，请重试。",
  };
}

export function createAlipaySdk(config: AlipayAdapterConfig): AlipayOpenApi {
  const sdk = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway ?? alipayGateway,
    keyType: "PKCS8",
    signType: "RSA2",
  });
  return {
    pageExecute: (method, httpMethod, params) => sdk.pageExecute(method, httpMethod, params),
    exec: async (method, params) => sdk.exec(method, params),
    checkNotifySign: (postData) => sdk.checkNotifySign(postData),
  };
}

function isAbsoluteHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://")) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function closedInternationalPort(): PaymentPort {
  return {
    upstreamClose: "supported",
    createPayment: () => Promise.resolve(internationalUnavailable),
    queryPayment: () => Promise.resolve(internationalUnavailable),
    cancelPayment: () => Promise.resolve(cancelRetryable()),
    verifyNotification: () =>
      Promise.resolve({
        ok: false,
        error: "invalid_signature",
        message: "国际 Alipay+ 通知字段尚未进入平台合同。",
      }),
  };
}
