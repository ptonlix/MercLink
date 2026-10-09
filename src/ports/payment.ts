import type { PaymentChannel } from "../domain/commerce/order";
import type { MinorUnits } from "../shared/money";

export type { PaymentChannel };

export type PaymentViewStatus = "pending" | "paid" | "closed";

export type UpstreamClose = "supported" | "unsupported";

export type CreatePaymentInput = {
  paymentId: string;
  orderId: string;
  amount: MinorUnits;
  currency: string;
  subject: string;
  channel: PaymentChannel;
  clientAddress?: string | null;
};

export type CreatePaymentResult =
  | { ok: true; action: unknown; providerTradeNo: string | null }
  | { ok: false; error: "payment_retryable"; message: string };

export type QueryPaymentResult =
  | {
      ok: true;
      status: PaymentViewStatus;
      providerTradeNo: string | null;
      amount: MinorUnits | null;
    }
  | { ok: false; error: "payment_retryable" | "dependency_unavailable"; message: string };

export type CancelPaymentResult =
  | { ok: true; outcome: "closed" }
  | { ok: false; outcome: "unsupported" }
  | {
      ok: false;
      outcome: "already_paid";
      providerTradeNo: string | null;
      amount: MinorUnits | null;
    }
  | { ok: false; outcome: "retryable"; error: "payment_retryable"; message: string };

export type VerifyNotificationResult =
  | {
      ok: true;
      status: PaymentViewStatus;
      providerTradeNo: string;
      paymentId: string | null;
      amount: MinorUnits | null;
    }
  | { ok: false; error: "invalid_signature"; message: string };

export type RefundPaymentResult =
  | { ok: true }
  | { ok: false; error: "payment_retryable"; message: string }
  | { ok: false; outcome: "unsupported" };

export type PaymentPort = {
  readonly upstreamClose: UpstreamClose;
  createPayment: (input: CreatePaymentInput) => Promise<CreatePaymentResult>;
  queryPayment: (input: {
    paymentId: string;
    providerTradeNo: string | null;
  }) => Promise<QueryPaymentResult>;
  cancelPayment: (input: {
    paymentId: string;
    providerTradeNo: string | null;
  }) => Promise<CancelPaymentResult>;
  verifyNotification: (input: {
    body: string;
    headers: Readonly<Record<string, string | undefined>>;
  }) => Promise<VerifyNotificationResult>;
};

export type PaymentRefundPort = {
  refundPayment: (input: {
    paymentId: string;
    providerTradeNo: string | null;
    amount: MinorUnits;
  }) => Promise<RefundPaymentResult>;
};
