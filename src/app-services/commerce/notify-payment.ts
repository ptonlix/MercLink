import type { CommerceRuntime } from "./runtime";
import { syncProviderStatus } from "./payment-sync";

export type NotifyApplyResult =
  | { ok: true; body: "success"; changed: boolean }
  | { ok: false; body: "fail"; error: "invalid_signature" | "not_found" };

export async function applyPaymentNotification(input: {
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
  runtime: CommerceRuntime;
}): Promise<NotifyApplyResult> {
  const verified = await input.runtime.payment.verifyNotification({
    body: input.body,
    headers: input.headers,
  });
  if (!verified.ok) {
    return { ok: false, body: "fail", error: "invalid_signature" };
  }
  const payment =
    (await input.runtime.repo.findPaymentByTradeNo(verified.providerTradeNo)) ??
    (verified.paymentId === null
      ? null
      : await input.runtime.repo.findPaymentById(verified.paymentId));
  if (payment === null) {
    return { ok: false, body: "fail", error: "not_found" };
  }
  const graph = await input.runtime.repo.findById(payment.orderId);
  if (graph === null) {
    return { ok: false, body: "fail", error: "not_found" };
  }
  const before = graph.order.status;
  const next = await syncProviderStatus(
    input.runtime,
    graph,
    verified.status,
    verified.providerTradeNo,
  );
  return {
    ok: true,
    body: "success",
    changed: next.order.status !== before || next.payment.status !== graph.payment.status,
  };
}
