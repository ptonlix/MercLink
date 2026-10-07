import { describe, expect, it } from "vitest";
import { buyerActor, grantedScopes, hasScope } from "./actor";
import { apiRoutes, routesFor } from "./api-routes";
import { apiError, errorCodes, minimumErrorCodes } from "./errors";
import { createPublicId, hasIdPrefix, idPrefixes } from "./id";
import { minorUnits } from "./money";
import { authenticate, registerAuthenticator, resetAuthenticator } from "./seams/authenticate";

const buyerPaths = [
  "GET /api/v1/products",
  "GET /api/v1/products/{id}",
  "GET /api/v1/catalogs/{id}/schema",
  "POST /api/v1/orders",
  "GET /api/v1/orders/{id}",
];

const merchantPaths = [
  "GET /api/v1/catalogs",
  "POST /api/v1/catalogs",
  "GET /api/v1/catalogs/{id}/schema",
  "GET /api/v1/catalogs/{id}/fields",
  "POST /api/v1/catalogs/{id}/fields",
  "POST /api/v1/catalogs/{id}/fields/changes",
  "GET /api/v1/catalogs/{id}/products",
  "POST /api/v1/catalogs/{id}/products",
  "PATCH /api/v1/catalogs/{id}/products/{product_id}",
  "POST /api/v1/catalogs/{id}/products/{product_id}/publish",
  "POST /api/v1/catalogs/{id}/products/{product_id}/unpublish",
  "DELETE /api/v1/catalogs/{id}/products/{product_id}",
  "POST /api/v1/catalogs/{id}/products/{product_id}/restore",
  "POST /api/v1/catalogs/{id}/products/{product_id}/options",
  "POST /api/v1/catalogs/{id}/products/{product_id}/variants",
  "PATCH /api/v1/catalogs/{id}/variants/{variant_id}",
  "DELETE /api/v1/catalogs/{id}/variants/{variant_id}",
  "GET /api/v1/manage/orders",
];

describe("api routes", () => {
  it("covers buyer and merchant paths from PRD section 10", () => {
    const listed = new Set(apiRoutes.map((route) => `${route.method} ${route.path}`));
    for (const path of buyerPaths) {
      expect(listed.has(path)).toBe(true);
    }
    for (const path of merchantPaths) {
      expect(listed.has(path)).toBe(true);
    }
    expect(listed.has("POST /api/v1/payments/alipay/notify")).toBe(true);
    expect(listed.has("GET /.well-known/oauth-protected-resource")).toBe(true);

    const buyer = new Set(routesFor("buyer").map((route) => `${route.method} ${route.path}`));
    const merchant = new Set(routesFor("merchant").map((route) => `${route.method} ${route.path}`));
    for (const path of buyerPaths) {
      expect(buyer.has(path)).toBe(true);
    }
    for (const path of merchantPaths) {
      expect(merchant.has(path)).toBe(true);
    }
  });
});

describe("errors", () => {
  it("uses one body and the minimum codes", async () => {
    for (const code of minimumErrorCodes) {
      expect(errorCodes).toContain(code);
    }
    expect(errorCodes).toContain("password_change_required");
    expect(errorCodes).toContain("rate_limited");
    expect(errorCodes).toContain("sms_rate_limited");

    const response = apiError("validation_error", "Invalid JSON body\n    at secret line", 400);
    const text = await response.text();
    const body: unknown = JSON.parse(text);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "validation_error", message: "Invalid JSON body" });
    expect(text).not.toContain("at secret");
    expect(text).not.toContain("stack");
  });
});

describe("ids and money", () => {
  it("keeps public ids prefixed and prices in minor units", () => {
    const productId = createPublicId("product");
    const orderId = createPublicId("order");
    const imageId = createPublicId("image");
    expect(hasIdPrefix(productId, "product")).toBe(true);
    expect(hasIdPrefix(orderId, "order")).toBe(true);
    expect(hasIdPrefix(imageId, "image")).toBe(true);
    expect(imageId.startsWith(idPrefixes.image)).toBe(true);
    expect(imageId).not.toContain("photo");
    expect(productId.startsWith(idPrefixes.order)).toBe(false);
    expect(orderId.startsWith(idPrefixes.product)).toBe(false);
    expect(minorUnits(159900)).toBe(159900);
    expect(() => minorUnits(15.99)).toThrow(/minor units/);
  });
});

describe("actor", () => {
  it("resolves a buyer token to granted scopes only", async () => {
    registerAuthenticator(() => ({
      ok: true,
      actor: buyerActor({
        buyerId: createPublicId("buyer"),
        grantId: createPublicId("grant"),
        scopes: ["order:write", "order:read"],
      }),
    }));
    try {
      const result = await authenticate(
        new Request("https://merclink.example/api/v1/orders", {
          headers: { authorization: "Bearer buyer-token" },
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.actor.type).toBe("buyer");
      if (result.actor.type !== "buyer") {
        return;
      }
      expect(result.actor.buyerId.startsWith("byr_")).toBe(true);
      expect(result.actor.scopes).toEqual(["order:write", "order:read"]);
      expect(hasScope(result.actor, "product:write")).toBe(false);
      expect(() => grantedScopes(["order:write", "admin"])).toThrow(/Unknown scope/);
    } finally {
      resetAuthenticator();
    }
  });
});
