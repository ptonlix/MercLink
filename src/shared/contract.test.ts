import { describe, expect, it } from "vitest";
import { buyerActor, grantedScopes, hasScope } from "./actor";
import { apiRoutes, routesFor } from "./api-routes";
import {
  apiFailure,
  apiSuccess,
  businessCode,
  errorCodes,
  errorDefinitions,
  httpStatusFor,
  minimumErrorCodes,
  successCode,
  successMessage,
} from "./errors";
import { createRequestId, requestIdLength, requestIdPrefix } from "./request-id";
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
  "POST /api/v1/catalogs/{id}/products/{product_id}/axes",
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
  it("uses one numeric envelope and the shared status table", async () => {
    for (const code of minimumErrorCodes) {
      expect(errorCodes).toContain(code);
    }
    expect(errorCodes).toContain("password_change_required");
    expect(errorCodes).toContain("rate_limited");
    expect(errorCodes).toContain("sms_rate_limited");
    expect(Object.keys(errorDefinitions).sort()).toEqual([...errorCodes].sort());
    expect(successCode).toBe(200);
    expect(businessCode("variant_required")).toBe(40004);
    expect(httpStatusFor("variant_required")).toBe(400);
    expect(httpStatusFor("sms_rate_limited")).toBe(400);
    expect(httpStatusFor("conflict")).toBe(409);
    expect(businessCode("conflict")).toBe(40900);

    const response = apiFailure("validation_error", "Invalid JSON body\n    at secret line");
    const text = await response.text();
    const body = JSON.parse(text) as {
      code: number;
      message: string;
      data: unknown;
      timestamp: number;
      request_id: string;
    };

    expect(response.status).toBe(400);
    expect(body.code).toBe(40000);
    expect(body.message).toBe("Invalid JSON body");
    expect(body.data).toBeNull();
    expect(body.request_id.startsWith(requestIdPrefix)).toBe(true);
    expect(body.request_id).toHaveLength(requestIdLength);
    expect(response.headers.get("x-request-id")).toBe(body.request_id);
    expect(body.timestamp).toEqual(expect.any(Number));
    expect(text).not.toContain("at secret");
    expect(text).not.toContain("stack");
    expect(text).not.toContain('"error"');
  });

  it("keeps body code 200 when a resource is created", async () => {
    const response = apiSuccess({ id: "prd_example" }, { status: 201 });
    const body = (await response.json()) as { code: number; message: string; data: { id: string } };
    expect(response.status).toBe(201);
    expect(body.code).toBe(200);
    expect(body.message).toBe(successMessage);
    expect(body.data).toEqual({ id: "prd_example" });
  });

  it("reuses only a well-formed inbound request id", async () => {
    const inbound = createRequestId();
    const reused = apiFailure("not_found", "没有找到。", {
      request: new Request("https://merclink.example/api/v1/products/prd_1", {
        headers: { "x-request-id": inbound },
      }),
    });
    expect(reused.headers.get("x-request-id")).toBe(inbound);
    await expect(reused.json()).resolves.toMatchObject({ request_id: inbound, code: 40400 });

    const malformed = apiFailure("not_found", "没有找到。", {
      request: new Request("https://merclink.example/api/v1/products/prd_1", {
        headers: { "x-request-id": "trace-not-a-request-id" },
      }),
    });
    const generated = malformed.headers.get("x-request-id");
    expect(generated?.startsWith(requestIdPrefix)).toBe(true);
    expect(generated).not.toBe("trace-not-a-request-id");
    expect(generated).toHaveLength(requestIdLength);
  });
});

describe("ids and money", () => {
  it("keeps public ids prefixed and prices in minor units", () => {
    const productId = createPublicId("product");
    const orderId = createPublicId("order");
    const imageId = createPublicId("image");
    expect(hasIdPrefix(productId, "product")).toBe(true);
    expect(hasIdPrefix(orderId, "order")).toBe(true);
    expect(hasIdPrefix(createPublicId("challenge"), "challenge")).toBe(true);
    expect(createPublicId("challenge").startsWith("chg_")).toBe(true);
    expect(createPublicId("challenge").startsWith("grn_")).toBe(false);
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
