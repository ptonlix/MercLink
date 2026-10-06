import type { SeamTransaction } from "../../shared/seams/sellable-variants";
import { expiryDue, merchantOwnsLines } from "../../domain/commerce/order";
import {
  UniqueClientOrderError,
  type CommerceRepository,
  type CommerceUnit,
  type StoredGraph,
} from "./repository";

const testStock = Symbol.for("merclink.commerce.testStock");

type MemoryState = {
  stock: Map<string, number | null>;
  graphs: StoredGraph[];
};

export function readTestStock(tx: SeamTransaction): Map<string, number | null> | undefined {
  if (!(testStock in tx)) {
    return undefined;
  }
  const value = tx[testStock];
  return value instanceof Map ? value : undefined;
}

export function createMemoryCommerceRepository(
  stock: ReadonlyMap<string, number | null>,
): CommerceRepository & {
  stockOf(variantId: string): number | null | undefined;
  graphs(): readonly StoredGraph[];
} {
  let state: MemoryState = {
    stock: new Map(stock),
    graphs: [],
  };

  function unit(draft: MemoryState): CommerceUnit {
    const seamTx: SeamTransaction = {};
    Object.defineProperty(seamTx, testStock, { value: draft.stock });
    return {
      seamTx,
      findByClientNo(buyerId, clientOrderNo) {
        return Promise.resolve(
          draft.graphs.find(
            (graph) =>
              graph.order.buyerId === buyerId && graph.order.clientOrderNo === clientOrderNo,
          ) ?? null,
        );
      },
      findById(orderId) {
        return Promise.resolve(draft.graphs.find((graph) => graph.order.id === orderId) ?? null);
      },
      insertGraph(graph) {
        const duplicate = draft.graphs.some(
          (existing) =>
            existing.order.buyerId === graph.order.buyerId &&
            existing.order.clientOrderNo === graph.order.clientOrderNo,
        );
        if (duplicate) {
          return Promise.reject(new UniqueClientOrderError());
        }
        draft.graphs.push(cloneGraph(graph));
        return Promise.resolve();
      },
      lockPending(orderId, now) {
        const graph = draft.graphs.find((item) => item.order.id === orderId) ?? null;
        if (graph === null || !expiryDue(graph.order.status, graph.order.expiresAt, now)) {
          return Promise.resolve(null);
        }
        if (graph.payment.status !== "pending") {
          return Promise.resolve(null);
        }
        return Promise.resolve(graph);
      },
      markClosed(orderId, now) {
        const graph = draft.graphs.find((item) => item.order.id === orderId);
        if (graph === undefined || graph.order.status !== "pending") {
          return Promise.resolve(false);
        }
        graph.order.status = "closed";
        graph.order.updatedAt = now;
        if (graph.payment.status === "pending") {
          graph.payment.status = "closed";
          graph.payment.updatedAt = now;
        }
        return Promise.resolve(true);
      },
      applyStatuses(input) {
        const graph = draft.graphs.find((item) => item.order.id === input.orderId);
        if (graph !== undefined) {
          for (const write of input.writes) {
            if (write === "payment") {
              graph.payment.status = input.paymentStatus;
              graph.payment.updatedAt = input.now;
              graph.payment.paidAt = input.paymentStatus === "paid" ? input.paidAt : null;
            }
            if (write === "order") {
              graph.order.status = input.orderStatus;
              graph.order.updatedAt = input.now;
              if (input.orderStatus === "paid") {
                graph.order.paidAt = input.paidAt;
              }
            }
          }
        }
        return Promise.resolve();
      },
      listByCatalogs(catalogIds) {
        return Promise.resolve(
          draft.graphs.filter((graph) =>
            merchantOwnsLines(
              graph.items.map((item) => item.catalogId),
              catalogIds,
            ),
          ),
        );
      },
      listExpiredPending(now) {
        return Promise.resolve(
          draft.graphs
            .map((graph) => graph.order)
            .filter((order) => expiryDue(order.status, order.expiresAt, now)),
        );
      },
    };
  }

  return {
    async transaction(run) {
      const draft = cloneState(state);
      try {
        const result = await run(unit(draft));
        state = draft;
        return result;
      } catch (error) {
        throw error;
      }
    },
    findById(orderId) {
      return Promise.resolve(state.graphs.find((graph) => graph.order.id === orderId) ?? null);
    },
    findPaymentByTradeNo(providerTradeNo) {
      const payment =
        state.graphs.find((graph) => graph.payment.providerTradeNo === providerTradeNo)?.payment ??
        null;
      return Promise.resolve(payment);
    },
    findPaymentById(paymentId) {
      const payment = state.graphs.find((graph) => graph.payment.id === paymentId)?.payment ?? null;
      return Promise.resolve(payment);
    },
    saveProviderTradeNo(paymentId, providerTradeNo) {
      const graph = state.graphs.find((item) => item.payment.id === paymentId);
      if (graph !== undefined && graph.payment.providerTradeNo === null) {
        graph.payment.providerTradeNo = providerTradeNo;
      }
      return Promise.resolve();
    },
    listByCatalogs(catalogIds) {
      return Promise.resolve(
        state.graphs.filter((graph) =>
          merchantOwnsLines(
            graph.items.map((item) => item.catalogId),
            catalogIds,
          ),
        ),
      );
    },
    listExpiredPending(now) {
      return Promise.resolve(
        state.graphs
          .map((graph) => graph.order)
          .filter((order) => expiryDue(order.status, order.expiresAt, now)),
      );
    },
    stockOf(variantId) {
      return state.stock.get(variantId);
    },
    graphs() {
      return state.graphs;
    },
  };
}

function cloneState(state: MemoryState): MemoryState {
  return {
    stock: new Map(state.stock),
    graphs: state.graphs.map(cloneGraph),
  };
}

function cloneGraph(graph: StoredGraph): StoredGraph {
  return {
    order: { ...graph.order },
    items: graph.items.map((item) => ({
      ...item,
      variantSnapshot: {
        ...item.variantSnapshot,
        optionValues: { ...item.variantSnapshot.optionValues },
      },
      fieldsSnapshot: { ...item.fieldsSnapshot },
    })),
    payment: { ...graph.payment },
  };
}
