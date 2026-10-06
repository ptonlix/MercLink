import type { MinorUnits } from "../shared/money";

export type PaymentViewStatus = "pending" | "paid" | "closed";

export type CreatePaymentInput = {
  paymentId: string;
  orderId: string;
  amount: MinorUnits;
  currency: string;
  subject: string;
};

export type CreatePaymentResult =
  | { ok: true; action: unknown; providerTradeNo: string | null }
  | { ok: false; error: "payment_retryable"; message: string };

export type QueryPaymentResult =
  | { ok: true; status: PaymentViewStatus; providerTradeNo: string | null }
  | { ok: false; error: "payment_retryable" | "dependency_unavailable"; message: string };

export type CancelPaymentResult =
  { ok: true } | { ok: false; error: "payment_retryable"; message: string };

export type VerifyNotificationResult =
  | {
      ok: true;
      status: PaymentViewStatus;
      providerTradeNo: string;
      paymentId: string | null;
    }
  | { ok: false; error: "invalid_signature"; message: string };

export type PaymentPort = {
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
