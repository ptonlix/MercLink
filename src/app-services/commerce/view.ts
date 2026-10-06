import type { ErrorCode } from "../../shared/errors";
import { apiError } from "../../shared/errors";
import type { StoredGraph, StoredItem, StoredOrder, StoredPayment } from "./repository";

const statusByError: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  too_many_items: 400,
  variant_required: 400,
  insufficient_stock: 409,
  conflict: 409,
  payment_retryable: 503,
  invalid_signature: 400,
  dependency_unavailable: 503,
};

export function httpStatus(error: ErrorCode): number {
  return statusByError[error] ?? 400;
}

export function errorResponse(error: ErrorCode, message: string): Response {
  return apiError(error, message, httpStatus(error));
}

export function orderJson(
  order: StoredOrder,
  items: readonly StoredItem[],
  payment: StoredPayment | null,
  action: unknown,
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
    status: StoredPayment["status"];
    action: unknown;
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
            status: payment.status,
            action,
          },
  };
}

export function graphJson(graph: StoredGraph, action: unknown): ReturnType<typeof orderJson> {
  return orderJson(graph.order, graph.items, graph.payment, action);
}
