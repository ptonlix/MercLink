import { amountsMatch } from "../../domain/commerce/order";
import { recordUnappliedReceipt, syncProviderStatus } from "./payment-sync";
import { paymentPortFor, type CommerceRuntime } from "./runtime";

export type NotifyApplyResult =
  | { ok: true; body: "success"; changed: boolean }
  | { ok: false; body: "fail"; error: "invalid_signature" | "not_found" | "amount_mismatch" };

export async function applyPaymentNotification(input: {
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
  runtime: CommerceRuntime;
  provider?: string;
  unknownPayment?: "fail" | "success";
}): Promise<NotifyApplyResult> {
  const port =
    input.provider === undefined
      ? input.runtime.payment
      : paymentPortFor(input.runtime, input.provider);
  if (port === null) {
    return { ok: false, body: "fail", error: "invalid_signature" };
  }
  const verified = await port.verifyNotification({
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
    if (input.unknownPayment === "success") {
      return { ok: true, body: "success", changed: false };
    }
    return { ok: false, body: "fail", error: "not_found" };
  }
  if (input.provider !== undefined && payment.provider !== input.provider) {
    return { ok: false, body: "fail", error: "invalid_signature" };
  }
  const graph = await input.runtime.repo.findById(payment.orderId);
  if (graph === null) {
    if (input.unknownPayment === "success") {
      return { ok: true, body: "success", changed: false };
    }
    return { ok: false, body: "fail", error: "not_found" };
  }
  if (verified.status === "paid" && !amountsMatch(graph.payment.amount, verified.amount)) {
    return { ok: false, body: "fail", error: "amount_mismatch" };
  }
  const before = graph.order.status;
  const beforePayment = graph.payment.status;
  if (
    (graph.order.status === "closed" || graph.payment.status === "closed") &&
    verified.status === "paid"
  ) {
    const existing = await input.runtime.repo.findReceipt(graph.payment.id);
    const receipt = await recordUnappliedReceipt(input.runtime, graph, {
      providerStatus: "paid",
      providerTradeNo: verified.providerTradeNo,
      amount: verified.amount,
      upstreamCloseable: port.upstreamClose === "supported",
    });
    return { ok: true, body: "success", changed: existing === null && receipt !== null };
  }
  const next = await syncProviderStatus(
    input.runtime,
    graph,
    verified.status,
    verified.providerTradeNo,
    {
      amount: verified.amount,
      upstreamCloseable: port.upstreamClose === "supported",
    },
  );
  return {
    ok: true,
    body: "success",
    changed: next.order.status !== before || next.payment.status !== beforePayment,
  };
}
