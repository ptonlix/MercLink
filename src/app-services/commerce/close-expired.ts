import {
  amountsMatch,
  graceStillOpen,
  isFiniteStock,
  restoreQuantity,
  stockReleaseAt,
} from "../../domain/commerce/order";
import type { PaymentPort } from "../../ports/payment";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import { syncProviderStatus } from "./payment-sync";
import type { StoredGraph } from "./repository";
import { paymentPortFor, type CommerceRuntime } from "./runtime";

export async function closeExpiredOrders(
  runtime: CommerceRuntime,
  now: Date,
): Promise<{ closedIds: readonly string[] }> {
  const due = await runtime.repo.listExpiredPending(now);
  const closedIds: string[] = [];
  for (const order of due) {
    const graph = await runtime.repo.findById(order.id);
    if (graph === null || graph.order.status !== "pending" || graph.payment.status !== "pending") {
      continue;
    }
    const port = paymentPortFor(runtime, graph.payment.provider);
    if (port === null) {
      continue;
    }
    const queried = await port.queryPayment({
      paymentId: graph.payment.id,
      providerTradeNo: graph.payment.providerTradeNo,
    });
    if (!queried.ok) {
      continue;
    }
    if (queried.providerTradeNo !== null) {
      await runtime.repo.saveProviderTradeNo(graph.payment.id, queried.providerTradeNo);
    }
    if (queried.status === "paid") {
      if (queried.amount === null || !amountsMatch(graph.payment.amount, queried.amount)) {
        continue;
      }
      await syncProviderStatus(runtime, graph, "paid", queried.providerTradeNo, {
        amount: queried.amount,
        upstreamCloseable: port.upstreamClose === "supported",
      });
      continue;
    }
    const closed =
      port.upstreamClose === "supported"
        ? await closeWhenUpstreamCanClose(runtime, graph, port, queried.providerTradeNo, now)
        : await closeWhenUpstreamCannotClose(runtime, graph, now);
    if (closed) {
      closedIds.push(order.id);
    }
  }
  return { closedIds };
}

async function closeWhenUpstreamCanClose(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  port: PaymentPort,
  providerTradeNo: string | null,
  now: Date,
): Promise<boolean> {
  const cancelled = await port.cancelPayment({
    paymentId: graph.payment.id,
    providerTradeNo: providerTradeNo ?? graph.payment.providerTradeNo,
  });
  if (cancelled.ok) {
    return closeAndRestore(runtime, graph, now);
  }
  if (
    cancelled.outcome === "already_paid" &&
    amountsMatch(graph.payment.amount, cancelled.amount)
  ) {
    await syncProviderStatus(runtime, graph, "paid", cancelled.providerTradeNo, {
      amount: cancelled.amount,
      upstreamCloseable: true,
    });
  }
  return false;
}

async function closeWhenUpstreamCannotClose(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  now: Date,
): Promise<boolean> {
  const finite = graph.items.some((item) => isFiniteStock(item.variantSnapshot.stock));
  if (finite && graph.payment.stockReleaseAt === null) {
    await runtime.repo.transaction(async (unit) => {
      const locked = await unit.lockPending(graph.order.id, now);
      if (locked === null || locked.payment.stockReleaseAt !== null) {
        return;
      }
      await unit.setStockReleaseAt(graph.order.id, stockReleaseAt(locked.order.expiresAt), now);
    });
    return false;
  }
  if (finite && graceStillOpen(graph.payment.stockReleaseAt, now)) {
    return false;
  }
  return closeAndRestore(runtime, graph, now);
}

async function closeAndRestore(
  runtime: CommerceRuntime,
  graph: StoredGraph,
  now: Date,
): Promise<boolean> {
  return runtime.repo.transaction(async (unit) => {
    const locked = await unit.lockPending(graph.order.id, now);
    if (locked === null) {
      return false;
    }
    const marked = await unit.markClosed(graph.order.id, now);
    if (!marked) {
      return false;
    }
    for (const item of locked.items) {
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
    return true;
  });
}
