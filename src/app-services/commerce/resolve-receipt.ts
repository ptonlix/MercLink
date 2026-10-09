import { z } from "zod";

import {
  assertMerchantReads,
  merchantOwnsLines,
  type CommerceFailure,
} from "../../domain/commerce/order";
import type { Actor } from "../../shared/actor";
import { minorUnits } from "../../shared/money";
import type { StoredGraph, StoredReceipt } from "./repository";
import { paymentRefundFor, type CommerceRuntime } from "./runtime";
import { httpStatus } from "./view";

const bodySchema = z.strictObject({
  action: z.enum(["fulfill_manually", "refund"]),
});

export type ResolveReceiptResult =
  | { ok: true; receipt: StoredReceipt; graph: StoredGraph }
  | (CommerceFailure & { httpStatus: number });

export async function resolveUnappliedReceipt(input: {
  actor: Actor;
  paymentId: string;
  body: unknown;
  runtime: CommerceRuntime;
}): Promise<ResolveReceiptResult> {
  const merchant = assertMerchantReads(input.actor);
  if (!merchant.ok) {
    return { ...merchant, httpStatus: httpStatus(merchant.error) };
  }
  const parsed = bodySchema.safeParse(input.body);
  if (!parsed.success) {
    return failure("validation_error", "请求无效。");
  }
  const payment = await input.runtime.repo.findPaymentById(input.paymentId);
  if (payment === null) {
    return failure("not_found", "收款不存在。");
  }
  const graph = await input.runtime.repo.findById(payment.orderId);
  if (graph === null) {
    return failure("not_found", "收款不存在。");
  }
  const owned = await input.runtime.ownedCatalogs(merchant.merchant.merchantId);
  if (
    !merchantOwnsLines(
      graph.items.map((item) => item.catalogId),
      owned,
    )
  ) {
    return failure("not_found", "收款不存在。");
  }
  const receipt = await input.runtime.repo.findReceipt(payment.id);
  if (receipt === null) {
    return failure("not_found", "收款不存在。");
  }
  if (receipt.status === "fulfilled_manually" || receipt.status === "refunded") {
    return failure("conflict", "收款已处理。");
  }
  if (parsed.data.action === "refund" && payment.provider !== "easypay") {
    return failure("validation_error", "该支付记录不能退款。");
  }
  const readAt = receipt.updatedAt;
  const now = input.runtime.clock.now();
  const claimed = await input.runtime.repo.claimReceipt({
    paymentId: payment.id,
    expectedUpdatedAt: readAt,
    now: now.getTime() > readAt.getTime() ? now : new Date(readAt.getTime() + 1),
  });
  if (claimed === null) {
    return failure("conflict", "收款已处理。");
  }
  try {
    if (parsed.data.action === "fulfill_manually") {
      const updated = await input.runtime.repo.resolveReceipt({
        paymentId: payment.id,
        status: "fulfilled_manually",
        failureReason: null,
        now: input.runtime.clock.now(),
        expectedUpdatedAt: claimed.updatedAt,
      });
      if (updated === null) {
        return failure("conflict", "收款已处理。");
      }
      return { ok: true, receipt: updated, graph };
    }
    const refund = paymentRefundFor(input.runtime, payment.provider);
    const result =
      refund === null
        ? { ok: false as const, error: "payment_retryable" as const, message: "退款失败，请重试。" }
        : await refund.refundPayment({
            paymentId: payment.id,
            providerTradeNo: claimed.providerTradeNo,
            amount: minorUnits(claimed.amount),
          });
    if (!result.ok) {
      const reason = "message" in result ? result.message : "退款失败，请重试。";
      await input.runtime.repo.resolveReceipt({
        paymentId: payment.id,
        status: "refund_failed",
        failureReason: reason,
        now: input.runtime.clock.now(),
        expectedUpdatedAt: claimed.updatedAt,
      });
      return failure("payment_retryable", "退款失败，请重试。");
    }
    const updated = await input.runtime.repo.resolveReceipt({
      paymentId: payment.id,
      status: "refunded",
      failureReason: null,
      now: input.runtime.clock.now(),
      expectedUpdatedAt: claimed.updatedAt,
    });
    if (updated === null) {
      return failure("conflict", "收款已处理。");
    }
    return { ok: true, receipt: updated, graph };
  } finally {
    await input.runtime.repo.releaseReceiptClaim(payment.id);
  }
}

function failure(error: CommerceFailure["error"], message: string): ResolveReceiptResult {
  return { ok: false, error, message, httpStatus: httpStatus(error) };
}
