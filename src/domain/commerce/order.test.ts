import { describe, expect, it } from "vitest";
import { buyerActor, merchantActor, scriptActor } from "../../shared/actor";
import { minorUnits } from "../../shared/money";
import {
  amountsMatch,
  applyProviderStatus,
  graceStillOpen,
  shouldRecordUnappliedReceipt,
  stockReleaseAt,
  assertBuyerPlaces,
  assertBuyerReads,
  assertMerchantReads,
  buyerOwns,
  expiryDue,
  isExpired,
  isFiniteStock,
  lineAmount,
  merchantOwnsLines,
  orderExpiresAt,
  parsePaymentChannel,
  rejectCallerPrice,
  restoreQuantity,
  validateSingleLine,
} from "./order";

const buyer = buyerActor({
  buyerId: "byr_1",
  grantId: "grn_1",
  scopes: ["order:write", "order:read"],
});
const merchant = merchantActor({
  merchantId: "mch_1",
  grantId: "grn_m",
  scopes: ["order:read"],
});

describe("place order rules", () => {
  it("rejects two lines and a caller price", () => {
    expect(
      validateSingleLine([
        { variantId: "var_1", qty: 1 },
        { productId: "prd_1", qty: 1 },
      ]),
    ).toMatchObject({ ok: false, error: "too_many_items" });
    expect(validateSingleLine([])).toMatchObject({ ok: false, error: "validation_error" });
    expect(validateSingleLine([{ qty: 0 }])).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(validateSingleLine([{ qty: 1 }])).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(rejectCallerPrice({ price: 1 })).toMatchObject({ ok: false, error: "validation_error" });
    expect(rejectCallerPrice({ items: [{ variant_id: "var_1", qty: 1, price: 1 }] })).toMatchObject(
      {
        ok: false,
        error: "validation_error",
      },
    );
    expect(rejectCallerPrice({ items: [{ variant_id: "var_1", qty: 1 }] })).toEqual({ ok: true });
    expect(validateSingleLine([{ variantId: "var_1", qty: 2 }])).toMatchObject({
      ok: true,
      line: { qty: 2 },
    });
  });

  it("defaults payment channel to desktop and rejects any other value", () => {
    expect(parsePaymentChannel({ client_order_no: "a-1" })).toEqual({
      ok: true,
      channel: "desktop",
    });
    expect(parsePaymentChannel({ payment_channel: "desktop" })).toEqual({
      ok: true,
      channel: "desktop",
    });
    expect(parsePaymentChannel({ payment_channel: "mobile" })).toEqual({
      ok: true,
      channel: "mobile",
    });
    expect(
      parsePaymentChannel({ user_agent: "Mozilla/5.0 (iPhone)", "sec-ch-ua-mobile": "?1" }),
    ).toEqual({ ok: true, channel: "desktop" });
    for (const paymentChannel of ["app", "wap", "DESKTOP", " mobile", "", null, 1, ["mobile"]]) {
      expect(parsePaymentChannel({ payment_channel: paymentChannel })).toMatchObject({
        ok: false,
        error: "validation_error",
      });
    }
    expect(parsePaymentChannel(null)).toMatchObject({ ok: false, error: "validation_error" });
  });

  it("prices a line from the variant and expires in 30 minutes", () => {
    expect(lineAmount(minorUnits(159900), 2)).toBe(319800);
    expect(() => lineAmount(minorUnits(10), 0)).toThrow(/positive integer/);
    expect(() => lineAmount(minorUnits(Number.MAX_SAFE_INTEGER), 2)).toThrow(/safe integer/);
    const created = new Date("2026-05-16T00:00:00.000Z");
    const expires = orderExpiresAt(created);
    expect(expires.getTime() - created.getTime()).toBe(30 * 60 * 1000);
    expect(isExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
    expect(isExpired(expires, expires)).toBe(true);
    expect(expiryDue("pending", expires, expires)).toBe(true);
    expect(expiryDue("paid", expires, expires)).toBe(false);
    expect(expiryDue("pending", expires, new Date(expires.getTime() - 1))).toBe(false);
  });

  it("restores only finite stock", () => {
    expect(isFiniteStock(null)).toBe(false);
    expect(isFiniteStock(0)).toBe(true);
    expect(restoreQuantity(null, 3)).toBe(0);
    expect(restoreQuantity(4, 3)).toBe(3);
  });

  it("allows only a buyer to place and only the owner to read", () => {
    expect(assertBuyerPlaces(buyer)).toMatchObject({ ok: true });
    expect(assertBuyerPlaces(merchant)).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      assertBuyerPlaces(buyerActor({ buyerId: "byr_1", grantId: "grn_1", scopes: ["order:read"] })),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      assertBuyerPlaces(
        scriptActor({
          ownerType: "buyer",
          ownerId: "byr_1",
          keyId: "key_1",
          scopes: ["order:write"],
        }),
      ),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(assertBuyerReads(buyer)).toMatchObject({ ok: true });
    expect(assertBuyerReads(merchant)).toMatchObject({ ok: false, error: "forbidden" });
    expect(buyerOwns("byr_1", "byr_1")).toBe(true);
    expect(buyerOwns("byr_1", "byr_2")).toBe(false);
    expect(assertMerchantReads(merchant)).toMatchObject({ ok: true });
    expect(assertMerchantReads(buyer)).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      assertMerchantReads(
        merchantActor({ merchantId: "mch_1", grantId: "grn_m", scopes: ["product:read"] }),
      ),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(merchantOwnsLines(["cat_1"], ["cat_1"])).toBe(true);
    expect(merchantOwnsLines(["cat_2"], ["cat_1"])).toBe(false);
    expect(merchantOwnsLines([], ["cat_1"])).toBe(false);
  });
});

describe("payment status copy", () => {
  const now = new Date("2026-05-16T00:10:00.000Z");

  it("writes payment before the order and ignores a repeat", () => {
    const first = applyProviderStatus({
      orderStatus: "pending",
      paymentStatus: "pending",
      providerStatus: "paid",
      paidAt: null,
      now,
    });
    expect(first.writes).toEqual(["payment", "order"]);
    expect(first.orderStatus).toBe("paid");
    expect(first.paymentStatus).toBe("paid");
    expect(first.changed).toBe(true);
    expect(first.restoreStock).toBe(false);

    const repeat = applyProviderStatus({
      orderStatus: "paid",
      paymentStatus: "paid",
      providerStatus: "paid",
      paidAt: now,
      now: new Date(now.getTime() + 1000),
    });
    expect(repeat.changed).toBe(false);
    expect(repeat.writes).toEqual([]);
    expect(repeat.paidAt).toEqual(now);
  });

  it("does not treat a pending provider result or a closed order as a new payment", () => {
    expect(
      applyProviderStatus({
        orderStatus: "pending",
        paymentStatus: "pending",
        providerStatus: "pending",
        paidAt: null,
        now,
      }).changed,
    ).toBe(false);
    expect(
      applyProviderStatus({
        orderStatus: "closed",
        paymentStatus: "closed",
        providerStatus: "paid",
        paidAt: null,
        now,
      }).changed,
    ).toBe(false);
    expect(
      applyProviderStatus({
        orderStatus: "paid",
        paymentStatus: "paid",
        providerStatus: "closed",
        paidAt: now,
        now,
      }),
    ).toMatchObject({ changed: false, orderStatus: "paid" });
  });

  it("closes an unpaid order once and copies a paid payment onto a pending header", () => {
    const closed = applyProviderStatus({
      orderStatus: "pending",
      paymentStatus: "pending",
      providerStatus: "closed",
      paidAt: null,
      now,
    });
    expect(closed).toMatchObject({
      paymentStatus: "closed",
      orderStatus: "closed",
      restoreStock: true,
      writes: ["payment", "order"],
    });
    expect(
      applyProviderStatus({
        orderStatus: "closed",
        paymentStatus: "closed",
        providerStatus: "closed",
        paidAt: null,
        now,
      }).changed,
    ).toBe(false);
    const copy = applyProviderStatus({
      orderStatus: "pending",
      paymentStatus: "paid",
      providerStatus: "paid",
      paidAt: now,
      now,
    });
    expect(copy.writes).toEqual(["order"]);
    expect(copy.orderStatus).toBe("paid");
  });

  it("matches minor units, waits five minutes, and does not mark a closed payment paid", () => {
    expect(amountsMatch(159900, 159900)).toBe(true);
    expect(amountsMatch(159900, 159901)).toBe(false);
    expect(amountsMatch(159900, null)).toBe(false);

    const expiresAt = new Date("2026-05-16T00:30:00.000Z");
    const releaseAt = stockReleaseAt(expiresAt);
    expect(releaseAt.toISOString()).toBe("2026-05-16T00:35:00.000Z");
    expect(graceStillOpen(releaseAt, new Date("2026-05-16T00:34:59.000Z"))).toBe(true);
    expect(graceStillOpen(releaseAt, releaseAt)).toBe(false);
    expect(graceStillOpen(null, releaseAt)).toBe(false);

    const closedPaid = applyProviderStatus({
      orderStatus: "closed",
      paymentStatus: "closed",
      providerStatus: "paid",
      paidAt: null,
      now,
    });
    expect(closedPaid).toMatchObject({
      changed: false,
      orderStatus: "closed",
      paymentStatus: "closed",
      restoreStock: false,
    });
    expect(
      shouldRecordUnappliedReceipt({
        orderStatus: "closed",
        paymentStatus: "closed",
        providerStatus: "paid",
        amountMatches: true,
        upstreamCloseable: false,
      }),
    ).toBe(true);
    expect(
      shouldRecordUnappliedReceipt({
        orderStatus: "closed",
        paymentStatus: "closed",
        providerStatus: "paid",
        amountMatches: false,
        upstreamCloseable: false,
      }),
    ).toBe(false);
    expect(
      shouldRecordUnappliedReceipt({
        orderStatus: "closed",
        paymentStatus: "closed",
        providerStatus: "paid",
        amountMatches: true,
        upstreamCloseable: true,
      }),
    ).toBe(false);
  });
});
