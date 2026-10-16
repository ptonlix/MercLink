import { describe, expect, it } from "vitest";
import type { Actor } from "../../shared/actor";
import { purchaseDisabledMessage } from "../../shared/purchase-mode";
import { minorUnits } from "../../shared/money";
import { closeExpiredOrders } from "./close-expired";
import { applyPaymentNotification } from "./notify-payment";
import { placeOrder } from "./place-order";
import { listMerchantOrders, readBuyerOrder } from "./read-order";
import type { CommerceRuntime } from "./runtime";
import type { StoredGraph } from "./repository";

const buyer: Actor = {
  type: "buyer",
  buyerId: "byr_1",
  ownerId: "byr_1",
  grantId: "grn_1",
  scopes: ["order:write", "order:read"],
};

const merchant: Actor = {
  type: "merchant",
  merchantId: "mch_1",
  ownerId: "mch_1",
  grantId: "grn_m",
  scopes: ["order:read"],
};

const now = new Date("2026-10-12T00:00:00.000Z");

function graph(): StoredGraph {
  return {
    order: {
      id: "ord_1",
      buyerId: "byr_1",
      oauthGrantId: "grn_1",
      clientOrderNo: "same-no",
      currency: "CNY",
      amount: 100,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      paidAt: null,
      expiresAt: now,
    },
    items: [
      {
        id: "itm_1",
        orderId: "ord_1",
        catalogId: "cat_1",
        productId: "prd_1",
        variantId: "var_1",
        titleSnapshot: "灯",
        descriptionSnapshot: null,
        variantSnapshot: { sku: null, optionValues: {}, stock: 2 },
        priceSnapshot: 100,
        fieldsSnapshot: {},
        schemaRevision: 1,
        qty: 1,
        amount: 100,
        createdAt: now,
      },
    ],
    payment: {
      id: "pay_1",
      orderId: "ord_1",
      provider: "alipay",
      channel: "desktop",
      providerTradeNo: null,
      actionUrl: null,
      clientAddress: null,
      stockReleaseAt: null,
      status: "pending",
      amount: 100,
      currency: "CNY",
      createdAt: now,
      updatedAt: now,
      paidAt: null,
    },
  };
}

function runtime(): CommerceRuntime & { calls: string[] } {
  const calls: string[] = [];
  const stored = graph();
  return {
    calls,
    purchaseEnabled: false,
    clock: { now: () => now },
    ownedCatalogs: () => ["cat_1"],
    payment: {
      upstreamClose: "supported",
      createPayment: () => {
        calls.push("create");
        return Promise.reject(new Error("payment"));
      },
      queryPayment: () => {
        calls.push("query");
        return Promise.resolve({
          ok: true as const,
          status: "paid" as const,
          providerTradeNo: "trade",
          amount: minorUnits(100),
        });
      },
      cancelPayment: () => {
        calls.push("cancel");
        return Promise.reject(new Error("cancel"));
      },
      verifyNotification: () => {
        calls.push("verify");
        return Promise.resolve({
          ok: false as const,
          error: "invalid_signature" as const,
          message: "通知验签失败。",
        });
      },
    },
    repo: {
      transaction: () => {
        calls.push("transaction");
        return Promise.reject(new Error("stock"));
      },
      findById: () => Promise.resolve(stored),
      listByCatalogs: () => Promise.resolve([stored]),
      listExpiredPending: () => {
        calls.push("listExpired");
        return Promise.resolve([stored.order]);
      },
      findReceipt: () => Promise.resolve(null),
    } as unknown as CommerceRuntime["repo"],
  };
}

describe("purchase disabled commerce", () => {
  it("rejects placement before stock or payment and does not return a repeated order", async () => {
    const current = runtime();
    const result = await placeOrder({
      actor: buyer,
      runtime: current,
      body: {
        client_order_no: "same-no",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: "purchase_disabled",
      message: purchaseDisabledMessage,
    });
    expect(current.calls).toEqual([]);
  });

  it("rejects a buyer read before querying payment", async () => {
    const current = runtime();
    const result = await readBuyerOrder({ actor: buyer, orderId: "ord_1", runtime: current });
    expect(result).toMatchObject({ error: "purchase_disabled" });
    expect(current.calls).not.toContain("query");
  });

  it("lets a merchant read a historical order without changing payment status", async () => {
    const current = runtime();
    const result = await listMerchantOrders({ actor: merchant, runtime: current });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graphs[0]?.order.status).toBe("pending");
      expect(result.graphs[0]?.payment.status).toBe("pending");
    }
    expect(current.calls).not.toContain("query");
    const foreign = await listMerchantOrders({
      actor: { ...merchant, merchantId: "mch_other", ownerId: "mch_other" },
      runtime: { ...current, ownedCatalogs: () => [] },
    });
    expect(foreign.ok).toBe(true);
    if (foreign.ok) {
      expect(foreign.graphs).toEqual([]);
    }
  });

  it("does not close an expired pending order", async () => {
    const current = runtime();
    const closed = await closeExpiredOrders(current, now);
    expect(closed.closedIds).toEqual([]);
    expect(current.calls).not.toContain("listExpired");
    expect(current.calls).not.toContain("cancel");
  });

  it("does not mark an order paid when notification verification fails", async () => {
    const current = runtime();
    const notify = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: current,
      provider: "alipay",
    });
    expect(notify).toEqual({ ok: false, body: "fail", error: "invalid_signature" });
    expect(graph().order.status).toBe("pending");
  });
});
