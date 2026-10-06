import {
  applyProviderStatus,
  restoreQuantity,
  type OrderStatus,
} from "../../domain/commerce/order";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import type { StoredGraph } from "./repository";
import type { CommerceRuntime } from "./runtime";

export async function syncProviderStatus(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  providerStatus: OrderStatus,
  providerTradeNo: string | null,
): Promise<StoredGraph> {
  if (providerTradeNo !== null && providerTradeNo !== graph.payment.providerTradeNo) {
    await runtime.repo.saveProviderTradeNo(graph.payment.id, providerTradeNo);
    graph = {
      ...graph,
      payment: { ...graph.payment, providerTradeNo },
    };
  }
  const now = runtime.clock.now();
  const transition = applyProviderStatus({
    orderStatus: graph.order.status,
    paymentStatus: graph.payment.status,
    providerStatus,
    paidAt: graph.order.paidAt,
    now,
  });
  if (!transition.changed) {
    return graph;
  }
  await runtime.repo.transaction(async (unit) => {
    await unit.applyStatuses({
      orderId: graph.order.id,
      paymentStatus: transition.paymentStatus,
      orderStatus: transition.orderStatus,
      paidAt: transition.paidAt,
      now,
      writes: transition.writes,
    });
    if (transition.restoreStock) {
      for (const item of graph.items) {
        const qty = restoreQuantity(item.variantSnapshot.stock, item.qty);
        if (qty <= 0) {
          continue;
        }
        const restored = await sellableVariants.restore({
          variantId: item.variantId,
          qty,
          tx: unit.seamTx,
        });
        if (!restored.ok) {
          throw new Error(restored.message);
        }
      }
    }
  });
  return {
    order: {
      ...graph.order,
      status: transition.orderStatus,
      paidAt: transition.paidAt,
      updatedAt: now,
    },
    items: graph.items,
    payment: {
      ...graph.payment,
      status: transition.paymentStatus,
      paidAt: transition.paymentStatus === "paid" ? transition.paidAt : graph.payment.paidAt,
      updatedAt: now,
    },
  };
}

export async function reconcilePending(
  runtime: CommerceRuntime,
  graph: StoredGraph,
): Promise<StoredGraph> {
  if (graph.order.status !== "pending") {
    return graph;
  }
  const queried = await runtime.payment.queryPayment({
    paymentId: graph.payment.id,
    providerTradeNo: graph.payment.providerTradeNo,
  });
  if (!queried.ok || queried.status === "pending") {
    if (queried.ok && queried.providerTradeNo !== null) {
      await runtime.repo.saveProviderTradeNo(graph.payment.id, queried.providerTradeNo);
    }
    return graph;
  }
  return syncProviderStatus(runtime, graph, queried.status, queried.providerTradeNo);
}
