import { readFile } from "node:fs/promises";
import { describe, expect, it, afterEach } from "vitest";

import { closeExpiredOrders } from "./close-expired";
import { applyPaymentNotification } from "./notify-payment";
import { syncProviderStatus } from "./payment-sync";
import { placeOrder } from "./place-order";
import { readBuyerOrder } from "./read-order";
import { resolveUnappliedReceipt } from "./resolve-receipt";
import { graphJson } from "./view";
import { createMemoryCommerceRepository, readTestStock } from "./memory-store";
import type { CommerceRuntime } from "./runtime";
import type { PaymentPort, PaymentRefundPort, VerifyNotificationResult } from "../../ports/payment";
import { buyerActor, merchantActor } from "../../shared/actor";
import { minorUnits } from "../../shared/money";
import {
  resetSellableVariants,
  sellableVariants,
  type LockedSellable,
} from "../../shared/seams/sellable-variants";

type Variant = Omit<LockedSellable, "stock"> & { stock: number | null };

const createdAt = new Date("2026-05-16T00:00:00.000Z");
const expiry = new Date(createdAt.getTime() + 30 * 60 * 1000);
const graceEnd = new Date(expiry.getTime() + 5 * 60 * 1000);

afterEach(() => {
  resetSellableVariants();
});

describe("startup provider", () => {
  it("stores the startup provider and rejects a caller provider without changing stock", async () => {
    const alipay = harness({ var_1: variant({ stock: 4 }) }, { startupProvider: "alipay" });
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "ali-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: alipay.runtime,
      clientAddress: "203.0.113.10",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    expect(placed.graph.payment.provider).toBe("alipay");
    expect(alipay.stock("var_1")).toBe(3);

    const rejected = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "ali-2",
        payment_provider: "easypay",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: alipay.runtime,
    });
    expect(rejected).toMatchObject({ ok: false, error: "validation_error" });
    expect(alipay.stock("var_1")).toBe(3);
    expect(alipay.graphs().some((graph) => graph.order.clientOrderNo === "ali-2")).toBe(false);

    const finite = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "ali-3", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: alipay.runtime,
    });
    expect(finite.ok).toBe(true);
    if (finite.ok) {
      expect(finite.graph.payment.provider).toBe("alipay");
    }
    expect(alipay.stock("var_1")).toBe(2);

    alipay.runtime.startupProvider = "easypay";
    const repeated = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "ali-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: alipay.runtime,
    });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) {
      return;
    }
    expect(repeated.graph.order.id).toBe(placed.graph.order.id);
    expect(repeated.graph.payment.provider).toBe("alipay");
    expect(alipay.stock("var_1")).toBe(2);
  });

  it("uses easypay at startup and refuses a new order when that provider is not configured", async () => {
    const easy = harness(
      { var_1: variant({ stock: 3 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "easy-1", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.9",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    expect(placed.graph.payment.provider).toBe("easypay");
    expect(easy.stock("var_1")).toBe(2);
    expect(easy.creates()).toBe(1);

    const again = await placeOrder({
      actor: buyer(),
      body: {
        client_order_no: "easy-1",
        payment_channel: "desktop",
        items: [{ variant_id: "var_1", qty: 1 }],
      },
      runtime: easy.runtime,
    });
    expect(again.ok).toBe(true);
    expect(easy.creates()).toBe(1);
    expect(easy.stock("var_1")).toBe(2);
    if (again.ok) {
      expect(again.action).toBe(placed.action);
      expect(again.graph.payment.provider).toBe("easypay");
    }

    easy.runtime.startupReady = false;
    const blocked = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "easy-2", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
    });
    expect(blocked).toMatchObject({ ok: false, error: "dependency_unavailable" });
    expect(easy.stock("var_1")).toBe(2);
    expect(easy.graphs().some((graph) => graph.order.clientOrderNo === "easy-2")).toBe(false);
  });
});

describe("expiry and unapplied receipts", () => {
  it("restores finite EasyPay stock once after the grace period", async () => {
    const easy = harness(
      { var_1: variant({ stock: 5 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "grace", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.7",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    easy.query = { ok: false, error: "payment_retryable", message: "支付查询失败，请重试。" };
    await closeExpiredOrders(easy.runtime, expiry);
    expect(easy.stock("var_1")).toBe(3);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("pending");

    easy.query = { ok: true, status: "pending", providerTradeNo: null, amount: null };
    await closeExpiredOrders(easy.runtime, expiry);
    expect(easy.cancels()).toBe(0);
    const waiting = await easy.runtime.repo.findById(placed.graph.order.id);
    expect(waiting?.order.status).toBe("pending");
    expect(waiting?.payment.stockReleaseAt?.toISOString()).toBe(graceEnd.toISOString());
    expect(easy.stock("var_1")).toBe(3);

    easy.query = {
      ok: true,
      status: "paid",
      providerTradeNo: "easy_paid",
      amount: minorUnits(placed.graph.payment.amount),
    };
    await closeExpiredOrders(easy.runtime, new Date(graceEnd.getTime() - 1000));
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("paid");
    expect(easy.stock("var_1")).toBe(3);
  });

  it("closes an unpaid EasyPay order after grace and records one late receipt", async () => {
    const easy = harness(
      { var_1: variant({ stock: 5 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "late", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.6",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    await closeExpiredOrders(easy.runtime, expiry);
    await closeExpiredOrders(easy.runtime, graceEnd);
    expect(easy.stock("var_1")).toBe(5);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
    await closeExpiredOrders(easy.runtime, new Date(graceEnd.getTime() + 60_000));
    expect(easy.stock("var_1")).toBe(5);

    const mismatch = signedPaid(placed.graph.payment.id, minorUnits(1));
    easy.verify = mismatch;
    const failed = await applyPaymentNotification({
      body: "money=0.01",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    expect(failed).toMatchObject({ ok: false, body: "fail" });
    expect(await easy.runtime.repo.findReceipt(placed.graph.payment.id)).toBeNull();
    expect(easy.stock("var_1")).toBe(5);

    easy.verify = signedPaid(placed.graph.payment.id, minorUnits(placed.graph.payment.amount));
    const paid = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    expect(paid).toMatchObject({ ok: true, body: "success" });
    const receipt = await easy.runtime.repo.findReceipt(placed.graph.payment.id);
    expect(receipt).toMatchObject({ status: "open", amount: placed.graph.payment.amount });
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
    expect(easy.refunds()).toBe(0);

    const repeat = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    expect(repeat).toMatchObject({ ok: true, body: "success", changed: false });
    expect((await easy.runtime.repo.findReceipt(placed.graph.payment.id))?.id).toBe(receipt?.id);

    easy.verify = {
      ok: true,
      status: "paid",
      providerTradeNo: "missing_trade",
      paymentId: "pay_missing",
      amount: minorUnits(1),
    };
    const unknown = await applyPaymentNotification({
      body: "missing",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    expect(unknown).toMatchObject({ ok: true, body: "success" });
    expect(easy.graphs()).toHaveLength(1);
  });

  it("does not restore Alipay stock unless close succeeds, and does not record a receipt", async () => {
    const ali = harness({ var_1: variant({ stock: 4 }) }, { startupProvider: "alipay" });
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "ali-close", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: ali.runtime,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    ali.cancel = {
      ok: false,
      outcome: "retryable",
      error: "payment_retryable",
      message: "支付取消失败，请重试。",
    };
    await closeExpiredOrders(ali.runtime, expiry);
    expect(ali.stock("var_1")).toBe(3);
    expect((await ali.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("pending");

    ali.cancel = {
      ok: false,
      outcome: "already_paid",
      providerTradeNo: "trade_paid",
      amount: minorUnits(placed.graph.payment.amount),
    };
    await closeExpiredOrders(ali.runtime, expiry);
    expect((await ali.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("paid");
    expect(ali.stock("var_1")).toBe(3);

    const closed = harness({ var_1: variant({ stock: 2 }) }, { startupProvider: "alipay" });
    const pending = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "ali-closed", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: closed.runtime,
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) {
      return;
    }
    await closeExpiredOrders(closed.runtime, expiry);
    expect(closed.stock("var_1")).toBe(2);
    closed.verify = signedPaid(pending.graph.payment.id, minorUnits(pending.graph.payment.amount));
    const late = await applyPaymentNotification({
      body: "trade_status=TRADE_SUCCESS",
      headers: {},
      runtime: closed.runtime,
    });
    expect(late).toMatchObject({ ok: true, body: "success" });
    expect(await closed.runtime.repo.findReceipt(pending.graph.payment.id)).toBeNull();
    expect((await closed.runtime.repo.findById(pending.graph.order.id))?.order.status).toBe(
      "closed",
    );
  });
});

describe("merchant receipt resolution", () => {
  it("lets only the owning merchant fulfill or refund without marking paid", async () => {
    const easy = harness(
      { var_1: variant({ catalogId: "cat_own", stock: 2 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    easy.runtime.ownedCatalogs = () => ["cat_own"];
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "own-receipt", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.5",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    await closeExpiredOrders(easy.runtime, expiry);
    await closeExpiredOrders(easy.runtime, graceEnd);
    easy.verify = signedPaid(placed.graph.payment.id, minorUnits(placed.graph.payment.amount));
    await applyPaymentNotification({
      body: "paid",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    const before = await easy.runtime.repo.findReceipt(placed.graph.payment.id);
    expect(before?.status).toBe("open");

    const other = await resolveUnappliedReceipt({
      actor: merchantActor({ merchantId: "mch_other", grantId: "grn_o", scopes: ["order:read"] }),
      paymentId: placed.graph.payment.id,
      body: { action: "fulfill_manually" },
      runtime: { ...easy.runtime, ownedCatalogs: () => ["cat_other"] },
    });
    expect(other).toMatchObject({ ok: false, error: "not_found" });
    expect((await easy.runtime.repo.findReceipt(placed.graph.payment.id))?.status).toBe("open");

    const buyerRead = await readBuyerOrder({
      actor: buyer(),
      orderId: placed.graph.order.id,
      runtime: easy.runtime,
    });
    expect(buyerRead.ok).toBe(true);
    if (buyerRead.ok) {
      expect(buyerRead.receipt?.status).toBe("open");
    }
    const hidden = await readBuyerOrder({
      actor: buyer("byr_2"),
      orderId: placed.graph.order.id,
      runtime: easy.runtime,
    });
    expect(hidden).toMatchObject({ ok: false, error: "not_found" });

    easy.refundFails = true;
    const refund = await resolveUnappliedReceipt({
      actor: merchant(),
      paymentId: placed.graph.payment.id,
      body: { action: "refund" },
      runtime: easy.runtime,
    });
    expect(refund).toMatchObject({ ok: false, error: "payment_retryable" });
    expect((await easy.runtime.repo.findReceipt(placed.graph.payment.id))?.status).toBe(
      "refund_failed",
    );
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
    expect(easy.stock("var_1")).toBe(2);

    const fulfilled = await resolveUnappliedReceipt({
      actor: merchant(),
      paymentId: placed.graph.payment.id,
      body: { action: "fulfill_manually" },
      runtime: easy.runtime,
    });
    expect(fulfilled.ok).toBe(true);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
    expect(easy.stock("var_1")).toBe(2);
    const conflict = await resolveUnappliedReceipt({
      actor: merchant(),
      paymentId: placed.graph.payment.id,
      body: { action: "refund" },
      runtime: easy.runtime,
    });
    expect(conflict).toMatchObject({ ok: false, error: "conflict" });
    expect(easy.refunds()).toBe(1);
  });

  it("does not call the refund port again after the first claim", async () => {
    const easy = harness(
      { var_1: variant({ catalogId: "cat_own", stock: 2 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "claim-race", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.4",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    await closeExpiredOrders(easy.runtime, expiry);
    await closeExpiredOrders(easy.runtime, graceEnd);
    easy.verify = signedPaid(placed.graph.payment.id, minorUnits(placed.graph.payment.amount));
    await applyPaymentNotification({
      body: "paid",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    let calls = 0;
    const holder: { runtime: CommerceRuntime } = { runtime: easy.runtime };
    holder.runtime = {
      ...easy.runtime,
      payments: {
        portFor: (provider) => easy.runtime.payments?.portFor(provider) ?? null,
        refundFor: () => ({
          refundPayment: () => {
            calls += 1;
            return resolveUnappliedReceipt({
              actor: merchant(),
              paymentId: placed.graph.payment.id,
              body: { action: "refund" },
              runtime: holder.runtime,
            }).then((second) => {
              expect(second).toMatchObject({ ok: false, error: "conflict" });
              expect(calls).toBe(1);
              return { ok: true as const };
            });
          },
        }),
      },
    };
    const first = await resolveUnappliedReceipt({
      actor: merchant(),
      paymentId: placed.graph.payment.id,
      body: { action: "refund" },
      runtime: holder.runtime,
    });
    expect(first.ok).toBe(true);
    expect(calls).toBe(1);
    expect((await easy.runtime.repo.findReceipt(placed.graph.payment.id))?.status).toBe("refunded");
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
  });
});

describe("review fixes", () => {
  it("keeps a closed EasyPay order closed when a stale paid observation arrives", async () => {
    const easy = harness(
      { var_1: variant({ stock: 5 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "stale-easy", items: [{ variant_id: "var_1", qty: 2 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.3",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    const stale = structuredClone(placed.graph);
    await closeExpiredOrders(easy.runtime, expiry);
    await closeExpiredOrders(easy.runtime, graceEnd);
    expect(easy.stock("var_1")).toBe(5);
    const synced = await syncProviderStatus(easy.runtime, stale, "paid", "trade_late", {
      amount: minorUnits(stale.payment.amount),
      upstreamCloseable: false,
    });
    expect(synced.order.status).toBe("closed");
    expect(synced.payment.status).toBe("closed");
    expect(easy.stock("var_1")).toBe(5);
    expect(await easy.runtime.repo.findReceipt(placed.graph.payment.id)).toMatchObject({
      status: "open",
      amount: placed.graph.payment.amount,
      providerTradeNo: "trade_late",
    });
    const stored = await easy.runtime.repo.findById(placed.graph.order.id);
    expect(stored?.order.status).toBe("closed");
    expect(stored?.payment.status).toBe("closed");
  });

  it("does not record a receipt when a closeable channel already closed", async () => {
    const ali = harness({ var_1: variant({ stock: 4 }) }, { startupProvider: "alipay" });
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "stale-ali", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: ali.runtime,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    const stale = structuredClone(placed.graph);
    await closeExpiredOrders(ali.runtime, expiry);
    expect(ali.cancels()).toBeGreaterThan(0);
    expect(ali.stock("var_1")).toBe(4);
    const synced = await syncProviderStatus(ali.runtime, stale, "paid", "trade_late", {
      amount: minorUnits(stale.payment.amount),
      upstreamCloseable: true,
    });
    expect(synced.order.status).toBe("closed");
    expect(synced.payment.status).toBe("closed");
    expect(ali.stock("var_1")).toBe(4);
    expect(await ali.runtime.repo.findReceipt(placed.graph.payment.id)).toBeNull();
  });

  it("does not close or restore when a paid query amount cannot be compared", async () => {
    const easy = harness(
      { var_1: variant({ stock: 3 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "amount-null", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.2",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    easy.query = { ok: true, status: "paid", providerTradeNo: "easy_bad", amount: null };
    await closeExpiredOrders(easy.runtime, expiry);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("pending");
    expect(easy.stock("var_1")).toBe(2);
    expect(easy.cancels()).toBe(0);

    easy.query = {
      ok: true,
      status: "paid",
      providerTradeNo: "easy_bad",
      amount: minorUnits(1),
    };
    await closeExpiredOrders(easy.runtime, expiry);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("pending");
    expect(easy.stock("var_1")).toBe(2);
  });

  it("closes unlimited unpaid EasyPay stock without calling cancel", async () => {
    const easy = harness(
      { var_1: variant({ stock: null }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "unlimited", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.1",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    await closeExpiredOrders(easy.runtime, expiry);
    expect(easy.cancels()).toBe(0);
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("closed");
    expect(easy.stock("var_1")).toBeNull();
  });

  it("rejects a known payment verified by the other provider", async () => {
    const easy = harness(
      { var_1: variant({ stock: 2 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "wrong-port", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.11",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    easy.verify = signedPaid(placed.graph.payment.id, minorUnits(placed.graph.payment.amount));
    const mismatched = await applyPaymentNotification({
      body: "paid",
      headers: {},
      runtime: easy.runtime,
      provider: "alipay",
    });
    expect(mismatched).toMatchObject({ ok: false, body: "fail" });
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.order.status).toBe("pending");
    expect((await easy.runtime.repo.findById(placed.graph.order.id))?.payment.status).toBe(
      "pending",
    );
    expect(await easy.runtime.repo.findReceipt(placed.graph.payment.id)).toBeNull();
    expect(easy.stock("var_1")).toBe(1);

    easy.verify = {
      ok: true,
      status: "paid",
      providerTradeNo: "missing_trade",
      paymentId: "pay_missing",
      amount: minorUnits(1),
    };
    const unknown = await applyPaymentNotification({
      body: "missing",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    expect(unknown).toMatchObject({ ok: true, body: "success" });
    expect(easy.graphs()).toHaveLength(1);
  });

  it("does not decrement stock when EasyPay has no connection address", async () => {
    const easy = harness(
      { var_1: variant({ stock: 5 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const missing = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "no-ip", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: null,
    });
    expect(missing).toMatchObject({ ok: false, error: "payment_retryable" });
    expect(easy.stock("var_1")).toBe(5);
    expect(easy.graphs()).toHaveLength(0);
    expect(easy.creates()).toBe(0);

    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "retry-ip", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.12",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    const stored = easy.graphs()[0];
    if (stored === undefined) {
      return;
    }
    stored.payment.clientAddress = null;
    stored.payment.actionUrl = null;
    const creates = easy.creates();
    const retry = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "retry-ip", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: null,
    });
    expect(retry).toMatchObject({ ok: false, error: "payment_retryable" });
    expect(easy.creates()).toBe(creates);
    expect(easy.stock("var_1")).toBe(4);
  });

  it("shows the refund failure reason on the order read", async () => {
    const easy = harness(
      { var_1: variant({ catalogId: "cat_own", stock: 2 }) },
      { startupProvider: "easypay", upstreamClose: "unsupported" },
    );
    const placed = await placeOrder({
      actor: buyer(),
      body: { client_order_no: "reason", items: [{ variant_id: "var_1", qty: 1 }] },
      runtime: easy.runtime,
      clientAddress: "203.0.113.13",
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }
    await closeExpiredOrders(easy.runtime, expiry);
    await closeExpiredOrders(easy.runtime, graceEnd);
    easy.verify = signedPaid(placed.graph.payment.id, minorUnits(placed.graph.payment.amount));
    await applyPaymentNotification({
      body: "paid",
      headers: {},
      runtime: easy.runtime,
      provider: "easypay",
      unknownPayment: "success",
    });
    const queriesBeforeRead = easy.queries();
    const openRead = await readBuyerOrder({
      actor: buyer(),
      orderId: placed.graph.order.id,
      runtime: easy.runtime,
    });
    expect(openRead.ok).toBe(true);
    if (!openRead.ok) {
      return;
    }
    expect(easy.queries()).toBeGreaterThan(queriesBeforeRead);
    expect(graphJson(openRead.graph, null, openRead.receipt).unapplied_receipt).toMatchObject({
      status: "open",
      failure_reason: null,
    });

    easy.refundFails = true;
    const refund = await resolveUnappliedReceipt({
      actor: merchant(),
      paymentId: placed.graph.payment.id,
      body: { action: "refund" },
      runtime: easy.runtime,
    });
    expect(refund).toMatchObject({ ok: false, error: "payment_retryable" });
    const failed = await easy.runtime.repo.findReceipt(placed.graph.payment.id);
    const again = await readBuyerOrder({
      actor: buyer(),
      orderId: placed.graph.order.id,
      runtime: easy.runtime,
    });
    expect(again.ok).toBe(true);
    if (!again.ok || failed === null) {
      return;
    }
    expect(graphJson(again.graph, null, again.receipt).unapplied_receipt).toEqual({
      status: "refund_failed",
      amount: failed.amount,
      provider_trade_no: failed.providerTradeNo,
      failure_reason: "退款失败，请重试。",
    });
  });
});

describe("migration", () => {
  it("appends payment columns and the receipt table without editing applied SQL", async () => {
    const added = await readFile("src/db/migrations/013_easypay_finite_stock.sql", "utf8");
    expect(added).toContain("ADD COLUMN action_url text");
    expect(added).toContain("ADD COLUMN client_address text");
    expect(added).toContain("ADD COLUMN stock_release_at timestamptz");
    expect(added).toContain("CREATE TABLE unapplied_receipts");
    expect(added).toContain("payment_id text NOT NULL UNIQUE");
    expect(added).not.toMatch(/UPDATE payments SET provider/i);
    for (const filename of [
      "010_schema.sql",
      "011_merchant_profiles.sql",
      "012_payment_channel.sql",
    ]) {
      const applied = await readFile(`src/db/migrations/${filename}`, "utf8");
      expect(applied).not.toContain("unapplied_receipts");
      expect(applied).not.toContain("stock_release_at");
      expect(applied).not.toContain("action_url");
    }
  });
});

function signedPaid(
  paymentId: string,
  amount: ReturnType<typeof minorUnits>,
): VerifyNotificationResult {
  return {
    ok: true,
    status: "paid",
    providerTradeNo: `trade_${paymentId}`,
    paymentId,
    amount,
  };
}

function buyer(buyerId = "byr_1") {
  return buyerActor({ buyerId, grantId: `grn_${buyerId}`, scopes: ["order:write", "order:read"] });
}

function merchant() {
  return merchantActor({ merchantId: "mch_1", grantId: "grn_m", scopes: ["order:read"] });
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
    fields: {},
    schemaRevision: 1,
    ...overrides,
  };
}

function harness(
  variants: Record<string, Variant>,
  options: {
    startupProvider?: "alipay" | "easypay";
    upstreamClose?: "supported" | "unsupported";
  },
) {
  const repo = createMemoryCommerceRepository(
    new Map(Object.values(variants).map((item) => [item.variantId, item.stock])),
  );
  const creates: string[] = [];
  let refundCalls = 0;
  let cancelCalls = 0;
  let queryCalls = 0;
  const state: {
    query: Awaited<ReturnType<PaymentPort["queryPayment"]>>;
    cancel: Awaited<ReturnType<PaymentPort["cancelPayment"]>>;
    verify: VerifyNotificationResult;
    refundFails: boolean;
  } = {
    query: { ok: true, status: "pending", providerTradeNo: null, amount: null },
    cancel:
      options.upstreamClose === "unsupported"
        ? { ok: false, outcome: "unsupported" }
        : { ok: true, outcome: "closed" },
    verify: { ok: false, error: "invalid_signature", message: "通知验签失败。" },
    refundFails: false,
  };
  sellableVariants.register({
    lock: ({ variantId, qty, tx }) => {
      const stock = readTestStock(tx);
      const line = variantId === undefined ? undefined : variants[variantId];
      if (stock === undefined || line === undefined) {
        return Promise.resolve({ ok: false, error: "not_found", message: "规格不存在。" });
      }
      const current = stock.get(line.variantId);
      if (current === undefined) {
        return Promise.resolve({ ok: false, error: "not_found", message: "规格不存在。" });
      }
      if (current !== null && current < qty) {
        return Promise.resolve({ ok: false, error: "insufficient_stock", message: "库存不足。" });
      }
      if (current !== null) {
        stock.set(line.variantId, current - qty);
      }
      return Promise.resolve({ ok: true, line: { ...line, stock: current } });
    },
    restore: ({ variantId, qty, tx }) => {
      const stock = readTestStock(tx);
      const current = stock?.get(variantId);
      if (stock === undefined || current === undefined || current === null) {
        return Promise.resolve({ ok: false, error: "not_found", message: "规格不存在。" });
      }
      stock.set(variantId, current + qty);
      return Promise.resolve({ ok: true });
    },
  });
  const payment: PaymentPort = {
    upstreamClose: options.upstreamClose ?? "supported",
    createPayment: (input) => {
      creates.push(input.paymentId);
      return Promise.resolve({
        ok: true,
        action: `https://pay.example/${input.paymentId}`,
        providerTradeNo: null,
      });
    },
    queryPayment: () => {
      queryCalls += 1;
      return Promise.resolve(state.query);
    },
    cancelPayment: () => {
      cancelCalls += 1;
      return Promise.resolve(state.cancel);
    },
    verifyNotification: () => Promise.resolve(state.verify),
  };
  const refund: PaymentRefundPort = {
    refundPayment: () => {
      refundCalls += 1;
      if (state.refundFails) {
        return Promise.resolve({
          ok: false,
          error: "payment_retryable",
          message: "退款失败，请重试。",
        });
      }
      return Promise.resolve({ ok: true });
    },
  };
  const runtime: CommerceRuntime = {
    repo,
    payment,
    payments: {
      portFor: (provider) =>
        provider === (options.startupProvider ?? "alipay") ? payment : payment,
      refundFor: (provider) => (provider === "easypay" ? refund : null),
    },
    startupProvider: options.startupProvider ?? "alipay",
    startupReady: true,
    clock: { now: () => createdAt },
    ownedCatalogs: () => ["cat_own"],
  };
  return {
    runtime,
    stock: (variantId: string) => repo.stockOf(variantId),
    graphs: () => repo.graphs(),
    creates: () => creates.length,
    refunds: () => refundCalls,
    cancels: () => cancelCalls,
    queries: () => queryCalls,
    get query() {
      return state.query;
    },
    set query(value) {
      state.query = value;
    },
    set cancel(value: Awaited<ReturnType<PaymentPort["cancelPayment"]>>) {
      state.cancel = value;
    },
    set verify(value: VerifyNotificationResult) {
      state.verify = value;
    },
    set refundFails(value: boolean) {
      state.refundFails = value;
    },
  };
}
