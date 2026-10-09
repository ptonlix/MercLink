import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET as getOrder } from "../../app/api/v1/orders/[id]/route";
import { POST as placeRoute } from "../../app/api/v1/orders/route";
import { GET as listOrders } from "../../app/api/v1/manage/orders/route";
import { POST as notifyRoute } from "../../app/api/v1/payments/alipay/notify/route";
import { runOnce } from "../../jobs/close-expired-orders";
import type { PaymentPort, VerifyNotificationResult } from "../../ports/payment";
import { buyerActor, merchantActor } from "../../shared/actor";
import { minorUnits } from "../../shared/money";
import { resetAuthenticator, registerAuthenticator } from "../../shared/seams/authenticate";
import {
  resetSellableVariants,
  sellableVariants,
  type LockedSellable,
} from "../../shared/seams/sellable-variants";
import { placeOrder } from "./place-order";
import { applyPaymentNotification } from "./notify-payment";
import { readBuyerOrder } from "./read-order";
import { createMemoryCommerceRepository, readTestStock } from "./memory-store";
import {
  registerCatalogOwnership,
  resetCatalogOwnership,
  resetCommerceRuntime,
  useCommerceRuntime,
  type CommerceRuntime,
} from "./runtime";

type Variant = Omit<LockedSellable, "stock"> & { stock: number | null };

const createdAt = new Date("2026-05-16T00:00:00.000Z");

afterEach(() => {
  resetSellableVariants();
  resetAuthenticator();
  resetCommerceRuntime();
  resetCatalogOwnership();
});

describe("order placement", () => {
  it("rejects two lines and a caller price without touching stock", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 5 }) });
    const two = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "a-1",
        items: [
          { variant_id: "var_1", qty: 1 },
          { variant_id: "var_1", qty: 1 },
        ],
      },
      runtime: harness.runtime,
    });
    expect(two).toMatchObject({ ok: false, error: "too_many_items" });
    expect(harness.stock("var_1")).toBe(5);
    expect(harness.locks()).toBe(0);

    const priced = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "a-2",
        items: [{ variant_id: "var_1", qty: 2, price: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(priced).toMatchObject({ ok: false, error: "validation_error" });
    expect(harness.stock("var_1")).toBe(5);
  });

  it("requires a variant when the product has two sellable variants", async () => {
    const harness = harnessFor({
      var_a: variant({ variantId: "var_a", productId: "prd_multi", stock: 4 }),
      var_b: variant({ variantId: "var_b", productId: "prd_multi", stock: 4 }),
    });
    const result = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "multi", items: [{ product_id: "prd_multi", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(result).toMatchObject({ ok: false, error: "variant_required" });
    expect(harness.graphs()).toHaveLength(0);
    expect(harness.stock("var_a")).toBe(4);
  });

  it("locks finite stock once and keeps a repeated client order number", async () => {
    const harness = harnessFor({
      var_1: variant({ stock: 5, unitPrice: minorUnits(159900) }),
    });
    const first = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "agent-1", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: harness.runtime,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.graph.order.status).toBe("pending");
    expect(first.graph.order.amount).toBe(319800);
    expect(first.graph.items[0]?.amount).toBe(319800);
    expect(first.graph.payment.provider).toBe("alipay");
    expect(first.graph.payment.channel).toBe("desktop");
    expect(first.graph.payment.status).toBe("pending");
    expect(first.action).toBe(`https://pay.example/${first.graph.payment.id}`);
    expect(harness.stock("var_1")).toBe(3);
    expect("provider" in first.graph.order).toBe(false);
    expect("channel" in first.graph.order).toBe(false);

    const second = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "agent-1", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: harness.runtime,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.graph.order.id).toBe(first.graph.order.id);
    expect(harness.stock("var_1")).toBe(3);
    expect(harness.locks()).toBe(1);
    expect(harness.paymentIds()).toEqual([first.graph.payment.id, first.graph.payment.id]);

    const other = await placeOrder({
      actor: buyer("byr_2"),
      body: { client_order_no: "agent-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(other.ok).toBe(true);
    if (!other.ok) {
      return;
    }
    expect(other.graph.order.id).not.toBe(first.graph.order.id);
    expect(harness.stock("var_1")).toBe(2);
    expect(harness.channels()).toEqual(["desktop", "desktop", "desktop"]);
  });

  it("stores a channel once, ignores User-Agent, and does not switch on repeat", async () => {
    const placeSource = await readFile("src/app-services/commerce/place-order.ts", "utf8");
    const routeSource = await readFile("src/app/api/v1/orders/route.ts", "utf8");
    const domainSource = await readFile("src/domain/commerce/order.ts", "utf8");
    for (const source of [placeSource, domainSource]) {
      expect(source.toLowerCase()).not.toContain("user-agent");
      expect(source.toLowerCase()).not.toContain("sec-ch-ua");
      expect(source.toLowerCase()).not.toContain("x-forwarded-for");
      expect(source.toLowerCase()).not.toContain("x-real-ip");
    }
    expect(routeSource.toLowerCase()).not.toContain("user-agent");
    expect(routeSource.toLowerCase()).not.toContain("sec-ch-ua");
    expect(routeSource).toContain("clientAddress");
    expect(routeSource).not.toMatch(/payment_channel/);

    const harness = harnessFor({ var_1: variant({ stock: 5 }) });
    useCommerceRuntime(harness.runtime);
    registerAuthenticator(() => ({ ok: true, actor: buyer() }));
    const omitted = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer buyer",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          "sec-ch-ua-mobile": "?1",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({
          client_order_no: "ua-1",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(omitted.status).toBe(201);
    const omittedId = harness.graphs()[0]?.payment.id;
    const omittedBody: unknown = await omitted.json();
    expect(omittedBody).toMatchObject({
      code: 200,
      message: "成功",
      data: {
        payment: {
          channel: "desktop",
          action: `https://pay.example/${omittedId ?? ""}`,
        },
      },
    });
    expect(harness.stock("var_1")).toBe(4);
    expect(harness.channels()).toEqual(["desktop"]);
    expect(harness.graphs()[0]?.payment.clientAddress).toBe("203.0.113.10");

    const hinted = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "hint",
        user_agent: "Mobile",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(hinted).toMatchObject({ ok: false, error: "validation_error" });
    expect(harness.stock("var_1")).toBe(4);
    expect(harness.graphs()).toHaveLength(1);

    const invalid = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: { authorization: "Bearer buyer" },
        body: JSON.stringify({
          client_order_no: "bad-channel",
          payment_channel: "app",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: 40000, data: null });
    expect(harness.stock("var_1")).toBe(4);
    expect(harness.locks()).toBe(1);
    expect(harness.graphs().some((graph) => graph.order.clientOrderNo === "bad-channel")).toBe(
      false,
    );

    const mobile = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "mob-1",
        payment_channel: "mobile",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(mobile.ok).toBe(true);
    if (!mobile.ok) {
      return;
    }
    expect(mobile.graph.payment.channel).toBe("mobile");
    expect("channel" in mobile.graph.order).toBe(false);
    expect(harness.stock("var_1")).toBe(3);

    const repeated = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "mob-1",
        payment_channel: "desktop",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) {
      return;
    }
    expect(repeated.graph.order.id).toBe(mobile.graph.order.id);
    expect(repeated.graph.payment.channel).toBe("mobile");
    expect(harness.stock("var_1")).toBe(3);
    expect(harness.locks()).toBe(2);
    expect(harness.channels()).toEqual(["desktop", "mobile", "mobile"]);
    expect(harness.paymentIds()).toEqual([
      omittedId,
      mobile.graph.payment.id,
      mobile.graph.payment.id,
    ]);

    const read = await getOrder(
      new Request(`https://merclink.example/api/v1/orders/${mobile.graph.order.id}`, {
        headers: { authorization: "Bearer buyer" },
      }),
      { params: { id: mobile.graph.order.id } },
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      code: 200,
      data: {
        id: mobile.graph.order.id,
        payment: { channel: "mobile", action: null },
      },
    });
  });

  it("reads a trusted proxy address and does not trust the caller first hop", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 5 }) });
    useCommerceRuntime(harness.runtime);
    registerAuthenticator(() => ({ ok: true, actor: buyer() }));

    const trusted = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer buyer",
          "x-forwarded-for": "198.51.100.9, 203.0.113.20",
          "x-real-ip": "2001:db8::10",
        },
        body: JSON.stringify({
          client_order_no: "trusted-ip",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(trusted.status).toBe(201);
    expect(harness.graphs()[0]?.payment.clientAddress).toBe("2001:db8::10");
    expect(harness.graphs()[0]?.payment.channel).toBe("desktop");

    const lastHop = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer buyer",
          "x-forwarded-for": "198.51.100.1, 203.0.113.30",
        },
        body: JSON.stringify({
          client_order_no: "last-hop",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(lastHop.status).toBe(201);
    expect(harness.graphs()[1]?.payment.clientAddress).toBe("203.0.113.30");

    const forged = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: {
          authorization: "Bearer buyer",
          "x-forwarded-for": "not-an-ip, also-bad",
          "x-real-ip": "buyer-supplied",
        },
        body: JSON.stringify({
          client_order_no: "bad-ip",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(forged.status).toBe(201);
    expect(harness.graphs()[2]?.payment.clientAddress).toBeNull();
    expect(harness.graphs()[2]?.payment.channel).toBe("desktop");
  });

  it("keeps a pending mobile order when payment creation is rejected", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 2 }) }, { failCreate: true });
    const failed = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "wap-retry",
        payment_channel: "mobile",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(failed).toMatchObject({ ok: false, error: "payment_retryable" });
    expect(harness.graphs()).toHaveLength(1);
    expect(harness.graphs()[0]?.order.status).toBe("pending");
    expect(harness.graphs()[0]?.payment.status).toBe("pending");
    expect(harness.graphs()[0]?.payment.channel).toBe("mobile");
    expect(harness.stock("var_1")).toBe(1);

    harness.controls.failCreate = false;
    const retried = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "wap-retry",
        payment_channel: "desktop",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: harness.runtime,
    });
    expect(retried.ok).toBe(true);
    if (!retried.ok) {
      return;
    }
    expect(retried.graph.payment.channel).toBe("mobile");
    expect(retried.graph.order.status).toBe("pending");
    expect(harness.stock("var_1")).toBe(1);
    expect(harness.locks()).toBe(1);
    expect(harness.channels()).toEqual(["mobile", "mobile"]);
  });

  it("does not decrement unlimited stock and does not write an order when stock is short", async () => {
    const harness = harnessFor({
      var_open: variant({ variantId: "var_open", stock: null }),
      var_low: variant({ variantId: "var_low", stock: 1 }),
    });
    const open = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "open", items: [{ variant_id: "var_open", qty: 4 }] },
      runtime: harness.runtime,
    });
    expect(open.ok).toBe(true);
    expect(harness.stock("var_open")).toBeNull();

    const short = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "short", items: [{ variant_id: "var_low", qty: 2 }] },
      runtime: harness.runtime,
    });
    expect(short).toMatchObject({ ok: false, error: "insufficient_stock" });
    expect(harness.stock("var_low")).toBe(1);
    expect(harness.graphs().some((graph) => graph.order.clientOrderNo === "short")).toBe(false);
  });

  it("keeps the order pending when payment creation fails and retries the same payment", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 2 }) }, { failCreate: true });
    const failed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "pay-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(failed).toMatchObject({ ok: false, error: "payment_retryable" });
    const stored = harness.graphs();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.order.status).toBe("pending");
    expect(stored[0]?.payment.status).toBe("pending");
    const paymentId = stored[0]?.payment.id;

    harness.controls.failCreate = false;
    const retried = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "pay-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(retried.ok).toBe(true);
    expect(harness.stock("var_1")).toBe(1);
    expect(harness.paymentIds()).toEqual([paymentId, paymentId]);
    expect(harness.locks()).toBe(1);
  });

  it("rejects a merchant and does not expose a mark-paid route", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 1 }) });
    useCommerceRuntime(harness.runtime);
    registerAuthenticator(() => ({
      ok: true,
      actor: merchantActor({ merchantId: "mch_1", grantId: "grn_m", scopes: ["order:write"] }),
    }));
    const response = await placeRoute(
      new Request("https://merclink.example/api/v1/orders", {
        method: "POST",
        headers: { authorization: "Bearer merchant" },
        body: JSON.stringify({
          client_order_no: "m-1",
          items: [{ variant_id: "var_1", qty: 1 }],
        }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 40300, data: null });
    expect(harness.locks()).toBe(0);

    const files = await walk("src/app/api/v1");
    const manage = await readFile("src/app/api/v1/manage/orders/route.ts", "utf8");
    expect(files.some((file) => /mark[-_]?paid|orders\/paid/i.test(file))).toBe(false);
    expect(manage).toContain("export async function GET");
    expect(manage).not.toMatch(/export (async )?function (POST|PATCH|PUT|DELETE)/);
    const routes = await readFile("src/shared/api-routes.ts", "utf8");
    expect(routes).not.toMatch(/manage\/orders\/.*paid|markPaid/);
  });
});

describe("payment notification and expiry", () => {
  it("ignores a bad signature and applies a paid notification only once", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 3 }) });
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "n-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    harness.verify = { ok: false, error: "invalid_signature", message: "通知验签失败。" };
    const rejected = await applyPaymentNotification({
      body: "sign=bad",
      headers: {},
      runtime: harness.runtime,
    });
    expect(rejected).toMatchObject({ ok: false, error: "invalid_signature" });
    expect((await harness.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe(
      "pending",
    );

    harness.verify = {
      ok: true,
      status: "paid",
      providerTradeNo: "trade_1",
      paymentId: placed.graph.payment.id,
      amount: minorUnits(placed.graph.payment.amount),
    };
    const paid = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: harness.runtime,
    });
    expect(paid).toMatchObject({ ok: true, changed: true });
    expect(harness.writes()).toEqual([["payment", "order"]]);
    const stored = await harness.runtime.repo.findById(placed.graph.order.id);
    expect(stored?.payment.status).toBe("paid");
    expect(stored?.order.status).toBe("paid");
    const paidAt = stored?.order.paidAt;

    const repeat = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: harness.runtime,
    });
    expect(repeat).toMatchObject({ ok: true, changed: false });
    expect(harness.writes()).toEqual([["payment", "order"]]);
    expect((await harness.runtime.repo.findById(placed.graph.order.id))?.order.paidAt).toEqual(
      paidAt,
    );
  });

  it("reconciles a pending read when the provider already reports paid", async () => {
    const harness = harnessFor({ var_1: variant({ stock: 2 }) });
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "q-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    harness.queryStatus = "paid";
    const read = await readBuyerOrder({
      actor: buyer(),
      orderId: placed.graph.order.id,
      runtime: harness.runtime,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.graph.order.status).toBe("paid");
    expect(harness.queries()).toBe(1);

    const hidden = await readBuyerOrder({
      actor: buyer("byr_2"),
      orderId: placed.graph.order.id,
      runtime: harness.runtime,
    });
    expect(hidden).toMatchObject({ ok: false, error: "not_found" });
  });

  it("restores finite stock once and cancels payment once", async () => {
    const harness = harnessFor({
      var_1: variant({ stock: 5 }),
      var_open: variant({ variantId: "var_open", stock: null }),
    });
    useCommerceRuntime(harness.runtime);
    const finite = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "exp-1", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: harness.runtime,
    });
    const unlimited = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "exp-2", items: [{ variant_id: "var_open", qty: 2 }] },
      runtime: harness.runtime,
    });
    expect(finite.ok && unlimited.ok).toBe(true);
    expect(harness.stock("var_1")).toBe(3);

    const tooSoon = await runOnce(new Date(createdAt.getTime() + 30 * 60 * 1000 - 1));
    expect(tooSoon.closedIds).toEqual([]);
    expect(harness.stock("var_1")).toBe(3);
    expect(harness.cancels()).toBe(0);

    const closed = await runOnce(new Date(createdAt.getTime() + 30 * 60 * 1000));
    expect(closed.closedIds).toHaveLength(2);
    expect(harness.stock("var_1")).toBe(5);
    expect(harness.stock("var_open")).toBeNull();
    expect(harness.restores()).toBe(1);
    expect(harness.cancels()).toBe(2);

    const again = await runOnce(new Date(createdAt.getTime() + 60 * 60 * 1000));
    expect(again.closedIds).toEqual([]);
    expect(harness.stock("var_1")).toBe(5);
    expect(harness.restores()).toBe(1);
    expect(harness.cancels()).toBe(2);
    if (finite.ok) {
      expect((await harness.runtime.repo.findById(finite.graph.order.id))?.order.status).toBe(
        "closed",
      );
      expect((await harness.runtime.repo.findById(finite.graph.order.id))?.payment.status).toBe(
        "closed",
      );
    }
  });
});

describe("slice boundaries", () => {
  it("does not import catalog internals", async () => {
    const files = [
      ...(await walk("src/domain/commerce")),
      ...(await walk("src/app-services/commerce")),
      ...(await walk("src/adapters/alipay")),
      ...(await walk("src/app/api/v1/orders")),
      ...(await walk("src/app/api/v1/manage/orders")),
      ...(await walk("src/app/api/v1/payments")),
      "src/jobs/close-expired-orders.ts",
      "src/db/schema/commerce.ts",
      "src/db/migrations/010_schema.sql",
      "src/db/migrations/012_payment_channel.sql",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/domain\/catalog|app-services\/catalog|db\/schema\/catalog/);
      expect(source, file).not.toMatch(/from ["'][^"']*\/catalog/);
    }
  });

  it("scopes merchant reads and has no paid mutation on the list route", async () => {
    const harness = harnessFor({
      var_1: variant({ catalogId: "cat_own", stock: 2 }),
      var_2: variant({ variantId: "var_2", catalogId: "cat_other", stock: 2 }),
    });
    await placeOrder({
      actor: buyer(),
      body: { client_order_no: "own", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: harness.runtime,
    });
    await placeOrder({
      actor: buyer(),
      body: { client_order_no: "other", items: [{ variant_id: "var_2", qty: 1 }] },
      runtime: harness.runtime,
    });
    useCommerceRuntime(harness.runtime);
    registerCatalogOwnership(() => ["cat_own"]);
    harness.runtime.ownedCatalogs = () => ["cat_own"];
    registerAuthenticator(() => ({
      ok: true,
      actor: merchantActor({
        merchantId: "mch_1",
        grantId: "grn_m",
        scopes: ["order:read"],
      }),
    }));
    const response = await listOrders(
      new Request("https://merclink.example/api/v1/manage/orders?catalog_id=cat_own", {
        headers: { authorization: "Bearer merchant" },
      }),
    );
    const body: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: 200,
      data: { items: [{ items: [{ variant_id: "var_1" }] }] },
    });
    if (!isList(body)) {
      return;
    }
    expect(body.data.items).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("var_2");

    registerAuthenticator(() => ({
      ok: true,
      actor: buyer(),
    }));
    const hidden = await getOrder(
      new Request("https://merclink.example/api/v1/orders/ord_missing", {
        headers: { authorization: "Bearer buyer" },
      }),
      { params: { id: "ord_missing" } },
    );
    expect(hidden.status).toBe(404);

    const notify = await notifyRoute(
      new Request("https://merclink.example/api/v1/payments/alipay/notify", {
        method: "POST",
        body: "trade_status=TRADE_SUCCESS",
      }),
    );
    expect(await notify.text()).toBe("fail");
  });
});

function buyer(buyerId = "byr_1") {
  return buyerActor({
    buyerId,
    grantId: `grn_${buyerId}`,
    scopes: ["order:write", "order:read"],
  });
}

function variant(overrides: Partial<Variant> & { stock: number | null }): Variant {
  return {
    catalogId: "cat_1",
    productId: "prd_1",
    variantId: "var_1",
    title: "Shoe",
    currency: "CNY",
    unitPrice: minorUnits(159900),
    sku: "SHOE-42",
    optionValues: { size: "42" },
    fields: { weight_g: 480 },
    schemaRevision: 3,
    ...overrides,
  };
}

function harnessFor(
  variants: Record<string, Variant>,
  options: { failCreate?: boolean } = {},
): {
  runtime: CommerceRuntime;
  stock: (variantId: string) => number | null | undefined;
  locks: () => number;
  restores: () => number;
  paymentIds: () => readonly string[];
  channels: () => readonly string[];
  queries: () => number;
  cancels: () => number;
  writes: () => string[][];
  graphs: () => readonly {
    order: { clientOrderNo: string; status: string };
    payment: {
      status: string;
      id: string;
      channel: string;
      clientAddress: string | null;
    };
  }[];
  controls: { failCreate: boolean };
  verify: VerifyNotificationResult;
  queryStatus: "pending" | "paid" | "closed";
} {
  const repo = createMemoryCommerceRepository(
    new Map(Object.values(variants).map((item) => [item.variantId, item.stock])),
  );
  let lockCalls = 0;
  let restoreCalls = 0;
  const paymentIds: string[] = [];
  const channels: string[] = [];
  let queries = 0;
  let cancels = 0;
  const writes: string[][] = [];
  const state = {
    failCreate: options.failCreate ?? false,
    verify: {
      ok: false,
      error: "invalid_signature",
      message: "通知验签失败。",
    } as VerifyNotificationResult,
    queryStatus: "pending" as "pending" | "paid" | "closed",
  };
  sellableVariants.register({
    lock: ({ variantId, productId, qty, tx }) => {
      lockCalls += 1;
      const stock = readTestStock(tx);
      if (stock === undefined) {
        return Promise.resolve({
          ok: false,
          error: "dependency_unavailable",
          message: "缺少事务。",
        });
      }
      const resolved = resolveVariant(variants, variantId, productId);
      if (!resolved.ok) {
        return Promise.resolve(resolved);
      }
      const current = stock.get(resolved.line.variantId);
      if (current === undefined) {
        return Promise.resolve({ ok: false, error: "not_found", message: "规格不存在。" });
      }
      if (current !== null && current < qty) {
        return Promise.resolve({ ok: false, error: "insufficient_stock", message: "库存不足。" });
      }
      if (current !== null) {
        stock.set(resolved.line.variantId, current - qty);
      }
      return Promise.resolve({
        ok: true,
        line: { ...resolved.line, stock: current },
      });
    },
    restore: ({ variantId, qty, tx }) => {
      restoreCalls += 1;
      const stock = readTestStock(tx);
      if (stock === undefined) {
        return Promise.resolve({
          ok: false,
          error: "dependency_unavailable",
          message: "缺少事务。",
        });
      }
      const current = stock.get(variantId);
      if (current === undefined || current === null) {
        return Promise.resolve({ ok: false, error: "not_found", message: "规格不存在。" });
      }
      stock.set(variantId, current + qty);
      return Promise.resolve({ ok: true });
    },
  });
  const payment: PaymentPort = {
    upstreamClose: "supported",
    createPayment: (input) => {
      paymentIds.push(input.paymentId);
      channels.push(input.channel);
      if (state.failCreate) {
        return Promise.resolve({
          ok: false,
          error: "payment_retryable",
          message: "支付创建失败，请重试。",
        });
      }
      return Promise.resolve({
        ok: true,
        action: `https://pay.example/${input.paymentId}`,
        providerTradeNo: null,
      });
    },
    queryPayment: (input) => {
      queries += 1;
      const stored = repo.graphs().find((graph) => graph.payment.id === input.paymentId);
      return Promise.resolve({
        ok: true,
        status: state.queryStatus,
        providerTradeNo: state.queryStatus === "paid" ? "trade_q" : null,
        amount:
          state.queryStatus === "paid" && stored !== undefined
            ? minorUnits(stored.payment.amount)
            : null,
      });
    },
    cancelPayment: () => {
      cancels += 1;
      return Promise.resolve({ ok: true, outcome: "closed" as const });
    },
    verifyNotification: () => Promise.resolve(state.verify),
  };
  const wrapped = wrapWrites(repo, writes);
  const runtime: CommerceRuntime = {
    repo: wrapped,
    payment,
    clock: { now: () => createdAt },
    ownedCatalogs: () => [],
  };
  return {
    runtime,
    stock: (variantId) => repo.stockOf(variantId),
    locks: () => lockCalls,
    restores: () => restoreCalls,
    paymentIds: () => paymentIds,
    channels: () => channels,
    queries: () => queries,
    cancels: () => cancels,
    writes: () => writes,
    graphs: () => repo.graphs(),
    controls: state,
    get verify() {
      return state.verify;
    },
    set verify(value) {
      state.verify = value;
    },
    get queryStatus() {
      return state.queryStatus;
    },
    set queryStatus(value) {
      state.queryStatus = value;
    },
  };
}

function wrapWrites(
  repo: ReturnType<typeof createMemoryCommerceRepository>,
  writes: string[][],
): CommerceRuntime["repo"] {
  return {
    ...repo,
    transaction: (run) =>
      repo.transaction(async (unit) =>
        run({
          ...unit,
          applyStatuses: async (input) => {
            writes.push([...input.writes]);
            return unit.applyStatuses(input);
          },
        }),
      ),
  };
}

function resolveVariant(
  variants: Record<string, Variant>,
  variantId: string | undefined,
  productId: string | undefined,
):
  | { ok: true; line: Variant }
  | { ok: false; error: "variant_required" | "not_found"; message: string } {
  if (variantId !== undefined) {
    const line = variants[variantId];
    if (line === undefined) {
      return { ok: false, error: "not_found", message: "规格不存在。" };
    }
    return { ok: true, line };
  }
  const matches = Object.values(variants).filter((item) => item.productId === productId);
  if (matches.length > 1) {
    return { ok: false, error: "variant_required", message: "请指定可售规格。" };
  }
  const line = matches[0];
  if (line === undefined) {
    return { ok: false, error: "not_found", message: "规格不存在。" };
  }
  return { ok: true, line };
}

function isList(value: unknown): value is { data: { items: unknown[] } } {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }
  const data = value.data;
  return typeof data === "object" && data !== null && "items" in data && Array.isArray(data.items);
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}
