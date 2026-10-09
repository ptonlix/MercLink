import type {
  CancelPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentPort,
  PaymentViewStatus,
  QueryPaymentResult,
  VerifyNotificationResult,
} from "../../ports/payment";
import { devPaymentTokenMatches } from "../../shared/dev-stubs";
import { minorUnits, type MinorUnits } from "../../shared/money";

export type DevPaymentConfig = {
  appBaseUrl: string;
  signingSecret: string;
};

type DevPaymentState = {
  status: PaymentViewStatus;
  providerTradeNo: string;
  amount: MinorUnits;
};

const payments = new Map<string, DevPaymentState>();

export function resetDevPayments(): void {
  payments.clear();
}

function devPaymentAction(
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

export function devPaidNotification(input: {
  paymentId: string;
  providerTradeNo: string;
  token: string;
  amount?: number;
}): string {
  const params = new URLSearchParams({
    out_trade_no: input.paymentId,
    trade_no: input.providerTradeNo,
    trade_status: "TRADE_SUCCESS",
    dev_token: input.token,
  });
  if (input.amount !== undefined) {
    params.set("amount", String(input.amount));
  }
  return params.toString();
}

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value !== null && value.length > 0 ? value : null;
}

export function createDevPaymentPort(config: DevPaymentConfig): PaymentPort {
  return {
    upstreamClose: "supported",

    createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const providerTradeNo = `dev_${input.paymentId}`;
      payments.set(input.paymentId, {
        status: "pending",
        providerTradeNo,
        amount: input.amount,
      });
      return Promise.resolve({
        ok: true,
        action: devPaymentAction(config.appBaseUrl, input.paymentId, input.channel),
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

    cancelPayment(input): Promise<CancelPaymentResult> {
      const stored = payments.get(input.paymentId);
      if (stored !== undefined && stored.status === "pending") {
        payments.set(input.paymentId, { ...stored, status: "closed" });
      }
      return Promise.resolve({ ok: true, outcome: "closed" });
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
      const tradeNo = stored?.providerTradeNo ?? providerTradeNo;
      const amountText = params.get("amount");
      const parsedAmount =
        amountText !== null && /^\d+$/.test(amountText) ? Number(amountText) : null;
      const amount =
        parsedAmount !== null && Number.isSafeInteger(parsedAmount)
          ? minorUnits(parsedAmount)
          : (stored?.amount ?? null);
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
  };
}
