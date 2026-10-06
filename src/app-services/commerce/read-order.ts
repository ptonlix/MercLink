import {
  assertBuyerReads,
  assertMerchantReads,
  buyerOwns,
  merchantOwnsLines,
  type CommerceFailure,
} from "../../domain/commerce/order";
import type { Actor } from "../../shared/actor";
import type { StoredGraph } from "./repository";
import { reconcilePending } from "./payment-sync";
import type { CommerceRuntime } from "./runtime";
import { httpStatus } from "./view";

export type ReadOrderResult =
  { ok: true; graph: StoredGraph } | (CommerceFailure & { httpStatus: number });

export async function readBuyerOrder(input: {
  actor: Actor;
  orderId: string;
  runtime: CommerceRuntime;
}): Promise<ReadOrderResult> {
  const buyer = assertBuyerReads(input.actor);
  if (!buyer.ok) {
    return { ...buyer, httpStatus: httpStatus(buyer.error) };
  }
  const graph = await input.runtime.repo.findById(input.orderId);
  if (graph === null || !buyerOwns(buyer.buyer.buyerId, graph.order.buyerId)) {
    return {
      ok: false,
      error: "not_found",
      message: "订单不存在。",
      httpStatus: httpStatus("not_found"),
    };
  }
  return { ok: true, graph: await reconcilePending(input.runtime, graph) };
}

export async function listMerchantOrders(input: {
  actor: Actor;
  catalogId?: string;
  runtime: CommerceRuntime;
}): Promise<{ ok: true; graphs: StoredGraph[] } | (CommerceFailure & { httpStatus: number })> {
  const merchant = assertMerchantReads(input.actor);
  if (!merchant.ok) {
    return { ...merchant, httpStatus: httpStatus(merchant.error) };
  }
  const owned = await input.runtime.ownedCatalogs(merchant.merchant.merchantId);
  const catalogs =
    input.catalogId === undefined
      ? owned
      : owned.filter((catalogId) => catalogId === input.catalogId);
  const graphs = await input.runtime.repo.listByCatalogs(catalogs);
  const visible = graphs.filter((graph) =>
    merchantOwnsLines(
      graph.items.map((item) => item.catalogId),
      catalogs,
    ),
  );
  const reconciled: StoredGraph[] = [];
  for (const graph of visible) {
    reconciled.push(await reconcilePending(input.runtime, graph));
  }
  return { ok: true, graphs: reconciled };
}
