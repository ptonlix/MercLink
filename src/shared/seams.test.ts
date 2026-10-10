import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { minorUnits } from "./money";
import { authenticate, resetAuthenticator } from "./seams/authenticate";
import { defaultCatalog, resetDefaultCatalog } from "./seams/default-catalog";
import { publicProducts, resetPublicProducts } from "./seams/public-products";
import { publicStore, resetPublicStore } from "./seams/public-store";
import { resetSellableVariants, sellableVariants } from "./seams/sellable-variants";

describe("fail-closed seams", () => {
  it("challenges a missing bearer token", async () => {
    resetAuthenticator();
    const result = await authenticate(new Request("https://merclink.example/api/v1/orders"));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const body: unknown = JSON.parse(await result.response.text());
    expect(result.response.status).toBe(401);
    expect(isErrorBody(body)).toBe(true);
    if (!isErrorBody(body)) {
      return;
    }
    expect(body.code).toBe(40100);
    expect(body.data).toBeNull();
    expect(body.message.length).toBeGreaterThan(0);
    expect(body.request_id.startsWith("req_")).toBe(true);
    expect(result.response.headers.get("x-request-id")).toBe(body.request_id);
    expect("error" in body).toBe(false);
    expect(result.response.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource",
    );
  });

  it("rejects a presented token when no authenticator is registered", async () => {
    resetAuthenticator();
    const result = await authenticate(
      new Request("https://merclink.example/api/v1/orders", {
        headers: { authorization: "Bearer presented-token" },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const body: unknown = JSON.parse(await result.response.text());
    expect(result.response.status).toBe(401);
    expect(body).toMatchObject({ code: 40100, data: null });
    expect(body).not.toHaveProperty("error");
  });

  it("does not invent a sellable row when lock is unregistered", async () => {
    resetSellableVariants();
    const tx = trackingTransaction();
    const result = await sellableVariants.lock({
      variantId: "var_missing",
      qty: 1,
      tx,
    });
    expect(result).toMatchObject({ ok: false, error: "dependency_unavailable" });
    expect(tx.calls).toBe(0);

    const restored = await sellableVariants.restore({
      variantId: "var_missing",
      qty: 1,
      tx,
    });
    expect(restored).toMatchObject({ ok: false, error: "dependency_unavailable" });
    expect(tx.calls).toBe(0);
  });

  it("returns no store profile when the public store seam is unregistered", async () => {
    resetPublicStore();
    await expect(publicStore.get()).resolves.toBeNull();
  });

  it("returns an empty public page and not found when unregistered", async () => {
    resetPublicProducts();
    const page = await publicProducts.list({ q: "shoe", limit: 20 });
    expect(page).toEqual({ items: [], nextCursor: null });
    await expect(publicProducts.get("prd_missing")).resolves.toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("returns pending and does not write a catalog row when unregistered", async () => {
    resetDefaultCatalog();
    const tx = trackingTransaction();
    const result = await defaultCatalog.create({ merchantId: "mch_1", tx });
    expect(result).toEqual({ status: "pending" });
    expect(tx.calls).toBe(0);
  });

  it("uses a registered implementation instead of the fail-closed default", async () => {
    sellableVariants.register({
      lock: () =>
        Promise.resolve({
          ok: true,
          line: {
            catalogId: "cat_1",
            productId: "prd_1",
            variantId: "var_1",
            title: "Shoe",
            currency: "CNY",
            unitPrice: minorUnits(159900),
            stock: 4,
            sku: null,
            optionValues: { size: "42" },
            fields: { weight_g: 480 },
            schemaRevision: 1,
          },
        }),
      restore: () => Promise.resolve({ ok: true }),
    });
    try {
      const locked = await sellableVariants.lock({
        variantId: "var_1",
        qty: 1,
        tx: {},
      });
      expect(locked.ok).toBe(true);
      if (locked.ok) {
        expect(Number.isInteger(locked.line.unitPrice)).toBe(true);
        expect(locked.line.productId.startsWith("prd_")).toBe(true);
        expect(locked.line.variantId.startsWith("var_")).toBe(true);
      }
    } finally {
      resetSellableVariants();
    }
  });
});

describe("skill rewrites", () => {
  it("maps skill markdown to the agent-docs routes", async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual([
      { source: "/skill.md", destination: "/agent-docs/buyer-skill" },
      { source: "/merchant/skill.md", destination: "/agent-docs/merchant-skill" },
      { source: "/storefront/skill.md", destination: "/agent-docs/storefront-skill" },
    ]);
  });
});

function isErrorBody(value: unknown): value is {
  code: number;
  message: string;
  data: null;
  request_id: string;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (
    !("code" in value) ||
    !("message" in value) ||
    !("data" in value) ||
    !("request_id" in value)
  ) {
    return false;
  }
  return (
    typeof value.code === "number" &&
    typeof value.message === "string" &&
    value.data === null &&
    typeof value.request_id === "string"
  );
}

function trackingTransaction(): { calls: number } {
  return new Proxy(
    { calls: 0 },
    {
      get(target, property, receiver) {
        if (property === "calls") {
          return target.calls;
        }
        target.calls += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
    },
  );
}
