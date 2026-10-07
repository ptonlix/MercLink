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

export type DevPaymentConfig = {
  appBaseUrl: string;
  signingSecret: string;
};

type DevPaymentState = {
  status: PaymentViewStatus;
  providerTradeNo: string;
};

const payments = new Map<string, DevPaymentState>();

export function resetDevPayments(): void {
  payments.clear();
}

function devPaymentAction(appBaseUrl: string, paymentId: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/dev/pay/${paymentId}`;
}

export function devPaidNotification(input: {
  paymentId: string;
  providerTradeNo: string;
  token: string;
}): string {
  return new URLSearchParams({
    out_trade_no: input.paymentId,
    trade_no: input.providerTradeNo,
    trade_status: "TRADE_SUCCESS",
    dev_token: input.token,
  }).toString();
}

function readParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value !== null && value.length > 0 ? value : null;
}

export function createDevPaymentPort(config: DevPaymentConfig): PaymentPort {
  return {
    createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const providerTradeNo = `dev_${input.paymentId}`;
      payments.set(input.paymentId, { status: "pending", providerTradeNo });
      return Promise.resolve({
        ok: true,
        action: devPaymentAction(config.appBaseUrl, input.paymentId),
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
        });
      }
      return Promise.resolve({
        ok: true,
        status: stored.status,
        providerTradeNo: stored.providerTradeNo,
      });
    },

    cancelPayment(input): Promise<CancelPaymentResult> {
      const stored = payments.get(input.paymentId);
      if (stored !== undefined && stored.status === "pending") {
        payments.set(input.paymentId, { ...stored, status: "closed" });
      }
      return Promise.resolve({ ok: true });
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
      payments.set(paymentId, { status: "paid", providerTradeNo: tradeNo });
      return Promise.resolve({
        ok: true,
        status: "paid",
        providerTradeNo: tradeNo,
        paymentId,
      });
    },
  };
}
