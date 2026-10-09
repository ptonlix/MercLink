import {
  amountsMatch,
  applyProviderStatus,
  restoreQuantity,
  shouldRecordUnappliedReceipt,
  type OrderStatus,
} from "../../domain/commerce/order";
import { createPublicId } from "../../shared/id";
import type { MinorUnits } from "../../shared/money";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import type { CommerceUnit, StoredGraph, StoredReceipt } from "./repository";
import { paymentPortFor, type CommerceRuntime } from "./runtime";

export type ProviderObservation = {
  amount: MinorUnits | null;
  upstreamCloseable: boolean;
};

export async function syncProviderStatus(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  providerStatus: OrderStatus,
  providerTradeNo: string | null,
  observed: ProviderObservation,
): Promise<StoredGraph> {
  if (providerTradeNo !== null && providerTradeNo !== graph.payment.providerTradeNo) {
    await runtime.repo.saveProviderTradeNo(graph.payment.id, providerTradeNo);
  }
  const now = runtime.clock.now();
  return runtime.repo.transaction(async (unit) => {
    const locked = await unit.lockOrder(graph.order.id);
    if (locked === null) {
      return graph;
    }
    const fresh: StoredGraph = {
      ...locked,
      payment: {
        ...locked.payment,
        providerTradeNo: providerTradeNo ?? locked.payment.providerTradeNo,
      },
    };
    if (providerStatus === "paid") {
      return applyPaidObservation(runtime, unit, fresh, providerTradeNo, observed, now);
    }
    const transition = applyProviderStatus({
      orderStatus: fresh.order.status,
      paymentStatus: fresh.payment.status,
      providerStatus,
      paidAt: fresh.order.paidAt,
      now,
    });
    if (!transition.changed) {
      return fresh;
    }
    const applied = await unit.applyStatuses({
      orderId: fresh.order.id,
      paymentStatus: transition.paymentStatus,
      orderStatus: transition.orderStatus,
      paidAt: transition.paidAt,
      now,
      writes: transition.writes,
    });
    if (!applied) {
      return fresh;
    }
    if (transition.restoreStock && fresh.order.status === "pending") {
      await restoreFiniteStock(unit, fresh);
    }
    return {
      order: {
        ...fresh.order,
        status: transition.orderStatus,
        paidAt: transition.paidAt,
        updatedAt: now,
      },
      items: fresh.items,
      payment: {
        ...fresh.payment,
        status: transition.paymentStatus,
        paidAt: transition.paymentStatus === "paid" ? transition.paidAt : fresh.payment.paidAt,
        updatedAt: now,
      },
    };
  });
}

async function applyPaidObservation(
  runtime: CommerceRuntime,
  unit: CommerceUnit,
  fresh: StoredGraph,
  providerTradeNo: string | null,
  observed: ProviderObservation,
  now: Date,
): Promise<StoredGraph> {
  const matched = amountsMatch(fresh.payment.amount, observed.amount);
  const bothPending = fresh.order.status === "pending" && fresh.payment.status === "pending";
  if (bothPending && matched) {
    const paidAt = fresh.order.paidAt ?? now;
    const applied = await unit.applyStatuses({
      orderId: fresh.order.id,
      paymentStatus: "paid",
      orderStatus: "paid",
      paidAt,
      now,
      writes: ["payment", "order"],
    });
    if (!applied) {
      return fresh;
    }
    return {
      order: { ...fresh.order, status: "paid", paidAt, updatedAt: now },
      items: fresh.items,
      payment: { ...fresh.payment, status: "paid", paidAt, updatedAt: now },
    };
  }
  const closed = fresh.order.status === "closed" || fresh.payment.status === "closed";
  if (
    closed &&
    matched &&
    !observed.upstreamCloseable &&
    providerTradeNo !== null &&
    observed.amount !== null
  ) {
    await unit.insertOpenReceipt({
      id: createPublicId("receipt"),
      paymentId: fresh.payment.id,
      providerTradeNo,
      amount: observed.amount,
      now: runtime.clock.now(),
    });
  }
  return fresh;
}

async function restoreFiniteStock(unit: CommerceUnit, graph: StoredGraph): Promise<void> {
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

export async function reconcilePending(
  runtime: CommerceRuntime,
  graph: StoredGraph,
): Promise<StoredGraph> {
  const port = paymentPortFor(runtime, graph.payment.provider);
  if (port === null) {
    return graph;
  }
  const closedNonCancelable =
    graph.order.status === "closed" && port.upstreamClose === "unsupported";
  if (graph.order.status !== "pending" && !closedNonCancelable) {
    return graph;
  }
  const queried = await port.queryPayment({
    paymentId: graph.payment.id,
    providerTradeNo: graph.payment.providerTradeNo,
  });
  if (!queried.ok) {
    return graph;
  }
  if (queried.providerTradeNo !== null) {
    await runtime.repo.saveProviderTradeNo(graph.payment.id, queried.providerTradeNo);
    graph = {
      ...graph,
      payment: { ...graph.payment, providerTradeNo: queried.providerTradeNo },
    };
  }
  if (queried.status !== "paid" || !amountsMatch(graph.payment.amount, queried.amount)) {
    return graph;
  }
  return syncProviderStatus(runtime, graph, "paid", queried.providerTradeNo, {
    amount: queried.amount,
    upstreamCloseable: port.upstreamClose === "supported",
  });
}

export async function recordUnappliedReceipt(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  observed: {
    providerStatus: OrderStatus;
    providerTradeNo: string | null;
    amount: MinorUnits | null;
    upstreamCloseable: boolean;
  },
): Promise<StoredReceipt | null> {
  const matched = amountsMatch(graph.payment.amount, observed.amount);
  if (
    !shouldRecordUnappliedReceipt({
      orderStatus: graph.order.status,
      paymentStatus: graph.payment.status,
      providerStatus: observed.providerStatus,
      amountMatches: matched,
      upstreamCloseable: observed.upstreamCloseable,
    }) ||
    observed.providerTradeNo === null ||
    observed.amount === null
  ) {
    return null;
  }
  return runtime.repo.insertOpenReceipt({
    id: createPublicId("receipt"),
    paymentId: graph.payment.id,
    providerTradeNo: observed.providerTradeNo,
    amount: observed.amount,
    now: runtime.clock.now(),
  });
}
