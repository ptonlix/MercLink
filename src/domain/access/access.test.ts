import { describe, expect, it } from "vitest";
import { buyerActor, merchantActor, scriptActor } from "../../shared/actor";
import { apiKeyAllowed, isApiKeyToken } from "./api-key";
import {
  anonymousProductSearch,
  isCatalogMutation,
  isOrderPlacement,
  isPublicProductRead,
  roleDecision,
} from "./guard";
import {
  authorizationCreatesMerchant,
  buyerApprovalScopes,
  fixedApprovalScopes,
  grantedApprovalScopes,
  merchantApprovalScopes,
  selectAuthorizationPage,
} from "./scopes";
import {
  accessTokenTtlSeconds,
  deviceCodeTtlSeconds,
  otherGrantUnaffected,
  refreshTokenUsable,
  rotatedRefresh,
  sameHash,
  tokenHash,
} from "./tokens";

describe("authorization scopes", () => {
  it("opens the merchant page for catalog scopes and the buyer page for order scopes", () => {
    expect(selectAuthorizationPage(["field:write", "order:write"])).toBe("merchant");
    expect(selectAuthorizationPage(["product:write"])).toBe("merchant");
    expect(selectAuthorizationPage(["storefront:write"])).toBe("merchant");
    expect(selectAuthorizationPage(["order:write", "order:read"])).toBe("buyer");
    expect(selectAuthorizationPage(["product:read"])).toBe("invalid");
    expect(selectAuthorizationPage([])).toBe("invalid");
    expect(selectAuthorizationPage(["not-a-scope", "order:read"])).toBe("buyer");
  });

  it("fixes approval scopes and never creates a merchant", () => {
    expect(fixedApprovalScopes("merchant")).toEqual(merchantApprovalScopes);
    expect(fixedApprovalScopes("buyer")).toEqual(buyerApprovalScopes);
    expect(fixedApprovalScopes("merchant")).not.toContain("order:write");
    expect(grantedApprovalScopes("merchant", ["product:write"])).toEqual(merchantApprovalScopes);
    expect(grantedApprovalScopes("merchant", ["product:write"])).not.toContain("storefront:write");
    expect(grantedApprovalScopes("merchant", ["product:write", "storefront:write"])).toContain(
      "storefront:write",
    );
    expect(grantedApprovalScopes("merchant", ["storefront:write"])).not.toContain("order:write");
    expect(grantedApprovalScopes("buyer", ["order:write", "storefront:write"])).toEqual(
      buyerApprovalScopes,
    );
    expect(authorizationCreatesMerchant()).toBe(false);
  });
});

describe("token policy", () => {
  it("keeps access tokens at 15 minutes and device codes at minutes", () => {
    expect(accessTokenTtlSeconds).toBe(900);
    expect(deviceCodeTtlSeconds).toBe(600);
    expect(deviceCodeTtlSeconds).toBeLessThan(60 * 60);
  });

  it("rejects a revoked or rotated refresh token and leaves the other grant", () => {
    const current = tokenHash("refresh-1");
    const next = tokenHash("refresh-2");
    expect(current).not.toBe("refresh-1");
    expect(sameHash(current, tokenHash("refresh-1"))).toBe(true);
    expect(sameHash(current, next)).toBe(false);
    expect(
      refreshTokenUsable({ presentedHash: current, storedHash: current, revokedAt: null }),
    ).toBe(true);
    expect(
      refreshTokenUsable({
        presentedHash: current,
        storedHash: current,
        revokedAt: new Date(),
      }),
    ).toBe(false);
    expect(refreshTokenUsable({ presentedHash: current, storedHash: null, revokedAt: null })).toBe(
      false,
    );
    const rotated = rotatedRefresh(next);
    expect(rotated.previousUsable).toBe(false);
    expect(
      refreshTokenUsable({
        presentedHash: current,
        storedHash: rotated.storedHash,
        revokedAt: null,
      }),
    ).toBe(false);
    expect(otherGrantUnaffected("grn_a", "grn_b")).toBe(true);
    expect(otherGrantUnaffected("grn_a", "grn_a")).toBe(false);
  });
});

describe("role guard", () => {
  it("allows anonymous product search and forbids the wrong role", () => {
    expect(isPublicProductRead("GET", "/api/v1/products")).toBe(true);
    expect(isPublicProductRead("GET", "/api/v1/products/prd_1")).toBe(true);
    expect(isPublicProductRead("POST", "/api/v1/products")).toBe(false);
    expect(isOrderPlacement("POST", "/api/v1/orders")).toBe(true);
    expect(isCatalogMutation("POST", "/api/v1/catalogs")).toBe(true);
    expect(isCatalogMutation("GET", "/api/v1/catalogs")).toBe(false);
    expect(anonymousProductSearch()).toEqual({ type: "anonymous" });

    const merchant = merchantActor({
      merchantId: "mch_1",
      grantId: "grn_1",
      scopes: merchantApprovalScopes,
    });
    const buyer = buyerActor({
      buyerId: "byr_1",
      grantId: "grn_2",
      scopes: buyerApprovalScopes,
    });
    expect(roleDecision(merchant, "POST", "/api/v1/orders")).toMatchObject({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(roleDecision(buyer, "POST", "/api/v1/catalogs/cat_1/products")).toMatchObject({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(roleDecision(buyer, "POST", "/api/v1/orders")).toEqual({ ok: true });
    expect(roleDecision(merchant, "POST", "/api/v1/catalogs")).toEqual({ ok: true });
    expect(
      roleDecision(
        scriptActor({
          ownerType: "merchant",
          ownerId: "mch_1",
          keyId: "key_1",
          scopes: merchantApprovalScopes,
        }),
        "POST",
        "/api/v1/orders",
      ).ok,
    ).toBe(false);
    expect(
      roleDecision(
        scriptActor({
          ownerType: "buyer",
          ownerId: "byr_1",
          keyId: "key_2",
          scopes: buyerApprovalScopes,
        }),
        "PATCH",
        "/api/v1/catalogs/cat_1/products/prd_1",
      ).ok,
    ).toBe(false);
    expect(roleDecision(anonymousProductSearch(), "GET", "/api/v1/products")).toEqual({ ok: true });
  });
});

describe("api keys", () => {
  it("creates keys only for a logged-in account page", () => {
    expect(apiKeyAllowed({ loggedIn: true, authorizationPage: false })).toBe(true);
    expect(apiKeyAllowed({ loggedIn: true, authorizationPage: true })).toBe(false);
    expect(apiKeyAllowed({ loggedIn: false, authorizationPage: false })).toBe(false);
    expect(isApiKeyToken("key_abc")).toBe(true);
    expect(isApiKeyToken("opaque-token")).toBe(false);
  });
});
