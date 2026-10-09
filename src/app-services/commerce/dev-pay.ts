import { devPaidNotification } from "../../adapters/dev/payment";
import { devPaymentToken, devStubsEnabled } from "../../shared/dev-stubs";
import { loadEnv } from "../../shared/env";
import { applyPaymentNotification } from "./notify-payment";
import { commerceRuntime, type CommerceRuntime } from "./runtime";

export type DevPayView =
  | { ok: false }
  | {
      ok: true;
      paymentId: string;
      amount: number;
      currency: string;
      status: string;
      subject: string;
    };

export async function readDevPay(
  paymentId: string,
  runtime: CommerceRuntime = commerceRuntime(),
  source: NodeJS.ProcessEnv = process.env,
): Promise<DevPayView> {
  if (!devStubsEnabled(source)) {
    return { ok: false };
  }
  const payment = await runtime.repo.findPaymentById(paymentId);
  if (payment === null) {
    return { ok: false };
  }
  const graph = await runtime.repo.findById(payment.orderId);
  if (graph === null) {
    return { ok: false };
  }
  return {
    ok: true,
    paymentId: payment.id,
    amount: graph.order.amount,
    currency: graph.order.currency,
    status: graph.order.status,
    subject: graph.items[0]?.titleSnapshot ?? "order",
  };
}

export async function confirmDevPay(
  paymentId: string,
  runtime: CommerceRuntime = commerceRuntime(),
  source: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true } | { ok: false; status: 404 | 409 }> {
  const loaded = loadEnv(source);
  if (!loaded.ok || !devStubsEnabled(source)) {
    return { ok: false, status: 404 };
  }
  const payment = await runtime.repo.findPaymentById(paymentId);
  if (payment === null) {
    return { ok: false, status: 404 };
  }
  const providerTradeNo = payment.providerTradeNo ?? `dev_${payment.id}`;
  const result = await applyPaymentNotification({
    body: devPaidNotification({
      paymentId: payment.id,
      providerTradeNo,
      token: devPaymentToken(loaded.env.OAUTH_SIGNING_SECRET, payment.id, "paid"),
      amount: payment.amount,
    }),
    headers: {},
    runtime,
    provider: payment.provider,
  });
  if (!result.ok) {
    return { ok: false, status: 404 };
  }
  const after = await runtime.repo.findById(payment.orderId);
  if (after?.order.status !== "paid") {
    return { ok: false, status: 409 };
  }
  return { ok: true };
}
