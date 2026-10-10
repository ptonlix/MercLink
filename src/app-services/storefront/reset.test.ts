import { afterEach, describe, expect, it } from "vitest";
import type { ObjectStoragePort } from "../../ports/object-storage";
import { systemClock } from "../../ports/clock";
import { bindStorefrontRuntime, resetStorefrontRuntime } from "./runtime";
import { createMemoryStore } from "./store";
import { executeStorefrontReset, requestStorefrontReset } from "./reset";

const unusedLimit = {
  reserve: () => Promise.resolve({ ok: false as const, error: "unavailable" as const }),
  release: () => Promise.resolve({ ok: true as const }),
};

describe("storefront reset", () => {
  afterEach(() => {
    resetStorefrontRuntime();
  });

  it("keeps releases until an admin approves", async () => {
    const store = createMemoryStore();
    const deleted: string[] = [];
    store.releases.push({
      id: "sfr_old",
      merchantId: "mch_1",
      sourceKey: "storefront/releases/sfr_old/source",
      fallback: null,
      authorizeBuyer: null,
      authorizeMerchant: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
    });
    store.pointer.activeId = "sfr_old";
    bindStorefrontRuntime({
      store,
      objectStorage: storage(deleted),
      rateLimit: unusedLimit,
      clock: systemClock,
      readOrderStatus: () => Promise.resolve(null),
    });
    const requested = await requestStorefrontReset("mch_1");
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.value.status).toBe("pending");
    expect(requested.value.approvalUrl).toContain(`/admin/storefront-resets/${requested.value.id}`);
    expect(store.releases).toHaveLength(1);

    const blocked = await executeStorefrontReset(requested.value.id, "agent");
    expect(blocked.ok).toBe(false);
    expect(store.pointer.activeId).toBe("sfr_old");

    const executed = await executeStorefrontReset(requested.value.id, "admin");
    expect(executed.ok).toBe(true);
    if (executed.ok) {
      expect(executed.value.status).toBe("executed");
    }
    expect(store.releases).toHaveLength(0);
    expect(store.pointer.activeId).toBeNull();
    expect(store.resetRequests[0]?.status).toBe("executed");
    expect(deleted).toContain("storefront/releases/sfr_old/source");
  });

  it("leaves the pending request when an object delete fails", async () => {
    const store = createMemoryStore();
    store.releases.push({
      id: "sfr_old",
      merchantId: "mch_1",
      sourceKey: "storefront/releases/sfr_old/source",
      fallback: null,
      authorizeBuyer: null,
      authorizeMerchant: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
    });
    store.pointer.activeId = "sfr_old";
    store.pointer.previousId = "sfr_older";
    bindStorefrontRuntime({
      store,
      objectStorage: {
        put: () => Promise.resolve(),
        open: () => Promise.resolve(null),
        delete: () => Promise.reject(new Error("delete failed")),
        headBucket: () => Promise.resolve(),
      },
      rateLimit: unusedLimit,
      clock: systemClock,
      readOrderStatus: () => Promise.resolve(null),
    });
    const requested = await requestStorefrontReset("mch_1");
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const failed = await executeStorefrontReset(requested.value.id, "admin");
    expect(failed.ok).toBe(false);
    expect(store.releases).toHaveLength(1);
    expect(store.pointer.activeId).toBe("sfr_old");
    expect(store.pointer.previousId).toBe("sfr_older");
    expect(store.resetRequests[0]?.status).toBe("pending");
  });

  it("does not report success when the pending mark updates no row", async () => {
    const store = createMemoryStore();
    store.releases.push({
      id: "sfr_old",
      merchantId: "mch_1",
      sourceKey: "storefront/releases/sfr_old/source",
      fallback: null,
      authorizeBuyer: null,
      authorizeMerchant: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
    });
    store.pointer.activeId = "sfr_old";
    store.resetRequests.push({
      id: "reset_done",
      merchantId: "mch_1",
      status: "executed",
      createdAt: new Date("2026-10-10T00:00:00Z"),
      decidedAt: new Date("2026-10-10T00:00:00Z"),
    });
    const missed = await store.commitResetExecution("reset_done", new Date("2026-10-10T01:00:00Z"));
    expect(missed).toBe(false);
    expect(store.releases).toHaveLength(1);
    expect(store.pointer.activeId).toBe("sfr_old");
    expect(store.resetRequests[0]?.status).toBe("executed");

    bindStorefrontRuntime({
      store,
      objectStorage: storage([]),
      rateLimit: unusedLimit,
      clock: systemClock,
      readOrderStatus: () => Promise.resolve(null),
    });
    store.resetRequests.push({
      id: "reset_pending",
      merchantId: "mch_1",
      status: "pending",
      createdAt: new Date("2026-10-10T00:00:00Z"),
      decidedAt: null,
    });
    const originalKeys = store.listObjectKeys.bind(store);
    store.listObjectKeys = () => {
      const pending = store.resetRequests.find((item) => item.id === "reset_pending");
      if (pending !== undefined) {
        pending.status = "rejected";
      }
      return originalKeys();
    };
    const failed = await executeStorefrontReset("reset_pending", "admin");
    expect(failed.ok).toBe(false);
    expect(store.releases).toHaveLength(1);
    expect(store.pointer.activeId).toBe("sfr_old");
    expect(store.resetRequests.find((item) => item.id === "reset_pending")?.status).toBe(
      "rejected",
    );
  });
});

function storage(deleted: string[]): ObjectStoragePort {
  return {
    put: () => Promise.resolve(),
    open: () => Promise.resolve(null),
    delete: (key) => {
      deleted.push(key);
      return Promise.resolve();
    },
    headBucket: () => Promise.resolve(),
  };
}
