import { afterEach, describe, expect, it } from "vitest";
import { currentPurchaseEnabled, readPurchaseMode, resetPurchaseModeCache } from "./purchase-mode";

afterEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

describe("readPurchaseMode", () => {
  it("disables purchase when the variable is absent, empty, or 0", () => {
    expect(readPurchaseMode({})).toEqual({ ok: true, enabled: false });
    expect(readPurchaseMode({ MERCLINK_PURCHASE: "" })).toEqual({ ok: true, enabled: false });
    expect(readPurchaseMode({ MERCLINK_PURCHASE: "0" })).toEqual({ ok: true, enabled: false });
  });

  it("enables purchase only for the exact value 1", () => {
    expect(readPurchaseMode({ MERCLINK_PURCHASE: "1" })).toEqual({ ok: true, enabled: true });
  });

  it("rejects an unrecognized value without echoing it", () => {
    const secret = "true-secret-value";
    const read = readPurchaseMode({ MERCLINK_PURCHASE: secret });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.message).not.toContain(secret);
      expect(read.message).toContain("MERCLINK_PURCHASE");
    }
  });
});

describe("currentPurchaseEnabled", () => {
  it("does not change after the environment changes until reset", () => {
    process.env.MERCLINK_PURCHASE = "0";
    expect(currentPurchaseEnabled()).toBe(false);
    process.env.MERCLINK_PURCHASE = "1";
    expect(currentPurchaseEnabled()).toBe(false);
    resetPurchaseModeCache();
    expect(currentPurchaseEnabled()).toBe(true);
  });
});
