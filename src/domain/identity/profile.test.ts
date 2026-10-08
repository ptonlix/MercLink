import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buyerActor, merchantActor, scopes } from "../../shared/actor";
import { canWriteProfile, parseProfileBody, profileRequestFields } from "./profile";

const secrets = { phone: "13800138000", email: "secret@example.com" };

describe("merchant profile validation", () => {
  it("accepts a draft with empty text and null optional fields", () => {
    expect(
      parseProfileBody(draftBody({ display_name: "", summary: "", published: false }), secrets),
    ).toEqual({
      ok: true,
      value: {
        displayName: "",
        summary: "",
        websiteUrl: null,
        logoUrl: null,
        areaServed: null,
        address: null,
        published: false,
      },
    });
  });

  it("rejects a publish without a summary and does not treat markup as text", () => {
    expect(parseProfileBody(draftBody({ summary: "  ", published: true }), secrets)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parseProfileBody(draftBody({ summary: "<b>简介</b>" }), secrets)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(draftBody({ summary: "看 [这里](https://example.com)" }), secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
  });

  it("rejects the login phone and other URL schemes", () => {
    expect(parseProfileBody(draftBody({ website_url: "13800138000" }), secrets)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(draftBody({ website_url: "https://13800138000" }), secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(draftBody({ address: "邮箱 secret@example.com" }), secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(draftBody({ website_url: "javascript:alert(1)" }), secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(draftBody({ logo_url: "ftp://example.com/logo.png" }), secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
  });

  it("rejects unknown fields and does not add a profile scope", () => {
    expect(parseProfileBody({ ...draftBody(), phone: "13800138000" }, secrets)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parseProfileBody({ ...draftBody(), password: "secret" }, secrets)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody({ ...draftBody(), email: "secret@example.com" }, secrets),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(profileRequestFields).toEqual([
      "display_name",
      "summary",
      "website_url",
      "logo_url",
      "area_served",
      "address",
      "published",
    ]);
    expect(scopes).not.toContain("profile:write");
    expect(
      canWriteProfile(
        merchantActor({ merchantId: "mch_1", grantId: "grn_1", scopes: ["product:read"] }),
      ),
    ).toBe(false);
    expect(
      canWriteProfile(
        merchantActor({ merchantId: "mch_1", grantId: "grn_1", scopes: ["product:write"] }),
      ),
    ).toBe(true);
    expect(
      canWriteProfile(
        buyerActor({ buyerId: "byr_1", grantId: "grn_b", scopes: ["product:write"] }),
      ),
    ).toBe(false);
  });

  it("does not publish the admin-provisioned account name from the migration", async () => {
    const migration = await readFile("src/db/migrations/011_merchant_profiles.sql", "utf8");
    const provisioning = await readFile("src/app-services/identity/merchants.ts", "utf8");
    expect(migration).toContain("CREATE TABLE merchant_profiles");
    expect(migration).not.toMatch(/INSERT INTO merchant_profiles/i);
    expect(provisioning).not.toContain("merchant_profiles");
  });
});

function draftBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    display_name: "示例商店",
    summary: "一段虚构简介。",
    website_url: null,
    logo_url: null,
    area_served: null,
    address: null,
    published: false,
    ...overrides,
  };
}
