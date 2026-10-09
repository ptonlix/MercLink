import type { ErrorCode } from "../../shared/errors";
import { apiFailure, httpStatusFor } from "../../shared/errors";
import type {
  StoredGraph,
  StoredItem,
  StoredOrder,
  StoredPayment,
  StoredReceipt,
} from "./repository";

export function httpStatus(error: ErrorCode): number {
  return httpStatusFor(error);
}

export function errorResponse(error: ErrorCode, message: string, request?: Request): Response {
  return apiFailure(error, message, { request });
}

export function orderJson(
  order: StoredOrder,
  items: readonly StoredItem[],
  payment: StoredPayment | null,
  action: unknown,
  receipt: StoredReceipt | null = null,
): {
  id: string;
  status: StoredOrder["status"];
  amount: number;
  currency: string;
  updated_at: string;
  items: { id: string; variant_id: string; qty: number; amount: number }[];
  payment: {
    id: string;
    provider: string;
    channel: StoredPayment["channel"];
    status: StoredPayment["status"];
    action: unknown;
  } | null;
  unapplied_receipt: {
    status: StoredReceipt["status"];
    amount: number;
    provider_trade_no: string;
    failure_reason: string | null;
  } | null;
} {
  return {
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    updated_at: order.updatedAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      variant_id: item.variantId,
      qty: item.qty,
      amount: item.amount,
    })),
    payment:
      payment === null
        ? null
        : {
            id: payment.id,
            provider: payment.provider,
            channel: payment.channel,
            status: payment.status,
            action,
          },
    unapplied_receipt:
      receipt === null
        ? null
        : {
            status: receipt.status,
            amount: receipt.amount,
            provider_trade_no: receipt.providerTradeNo,
            failure_reason: receipt.failureReason,
          },
  };
}

export function graphJson(
  graph: StoredGraph,
  action: unknown,
  receipt: StoredReceipt | null = null,
): ReturnType<typeof orderJson> {
  return orderJson(graph.order, graph.items, graph.payment, action, receipt);
}
