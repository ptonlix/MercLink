import type {
  CancelPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentPort,
  PaymentRefundPort,
  PaymentViewStatus,
  QueryPaymentResult,
  RefundPaymentResult,
  VerifyNotificationResult,
} from "../../ports/payment";
import { minorUnits, type MinorUnits } from "../../shared/money";
import { devPaymentTokenMatches } from "../../shared/dev-stubs";

export type DevEasyPayConfig = {
  appBaseUrl: string;
  signingSecret: string;
  refundFails?: boolean;
};

type DevEasyPayState = {
  status: PaymentViewStatus;
  providerTradeNo: string;
  amount: MinorUnits;
};

const payments = new Map<string, DevEasyPayState>();

export function resetDevEasyPay(): void {
  payments.clear();
}

export function createDevEasyPayPort(config: DevEasyPayConfig): PaymentPort & PaymentRefundPort {
  return {
    upstreamClose: "unsupported",

    createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const providerTradeNo = `dev_easy_${input.paymentId}`;
      payments.set(input.paymentId, {
        status: "pending",
        providerTradeNo,
        amount: input.amount,
      });
      return Promise.resolve({
        ok: true,
        action: devEasyPayAction(config.appBaseUrl, input.paymentId, input.channel),
        providerTradeNo,
      });
    },

    queryPayment(input): Promise<QueryPaymentResult> {
      const stored = payments.get(input.paymentId);
      if (stored === undefined) {
        return Promise.resolve({
          ok: true,
          status: "pending",
          providerTradeNo: input.providerTradeNo,
          amount: null,
        });
      }
      return Promise.resolve({
        ok: true,
        status: stored.status,
        providerTradeNo: stored.providerTradeNo,
        amount: stored.status === "paid" ? stored.amount : null,
      });
    },

    cancelPayment(): Promise<CancelPaymentResult> {
      return Promise.resolve({ ok: false, outcome: "unsupported" });
    },

    verifyNotification(input): Promise<VerifyNotificationResult> {
      const params = new URLSearchParams(input.body);
      const paymentId = readParam(params, "out_trade_no");
      const providerTradeNo = readParam(params, "trade_no");
      const token = readParam(params, "dev_token");
      if (paymentId === null || providerTradeNo === null || token === null) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "模拟支付确认无效。",
        });
      }
      if (!devPaymentTokenMatches(config.signingSecret, paymentId, "paid", token)) {
        return Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "模拟支付确认无效。",
        });
      }
      const stored = payments.get(paymentId);
      const amount = readAmount(params) ?? stored?.amount ?? null;
      const tradeNo = stored?.providerTradeNo ?? providerTradeNo;
      if (amount !== null) {
        payments.set(paymentId, { status: "paid", providerTradeNo: tradeNo, amount });
      }
      return Promise.resolve({
        ok: true,
        status: "paid",
        providerTradeNo: tradeNo,
        paymentId,
        amount,
      });
    },

    refundPayment(): Promise<RefundPaymentResult> {
      if (config.refundFails === true) {
        return Promise.resolve({
          ok: false,
          error: "payment_retryable",
          message: "退款失败，请重试。",
        });
      }
      return Promise.resolve({ ok: true });
    },
  };
}

function devEasyPayAction(
  appBaseUrl: string,
  paymentId: string,
  channel: CreatePaymentInput["channel"],
): string {
  const trimmed = appBaseUrl.replace(/\/$/, "");
  const httpsBase = trimmed.startsWith("http://")
    ? `https://${trimmed.slice("http://".length)}`
    : trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return `${httpsBase}/dev/pay/${paymentId}?channel=${channel}`;
}

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value !== null && value.length > 0 ? value : null;
}

function readAmount(params: URLSearchParams): MinorUnits | null {
  const raw = params.get("amount");
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return minorUnits(value);
}
