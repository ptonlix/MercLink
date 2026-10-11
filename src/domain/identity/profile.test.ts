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
        license: null,
        contact: null,
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
      "license",
      "contact",
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
    const added = await readFile("src/db/migrations/016_merchant_profile_facts.sql", "utf8");
    const provisioning = await readFile("src/app-services/identity/merchants.ts", "utf8");
    const source = await readFile("src/domain/identity/profile.ts", "utf8");
    expect(migration).toContain("CREATE TABLE merchant_profiles");
    expect(migration).not.toMatch(/INSERT INTO merchant_profiles/i);
    expect(migration).not.toContain("license_name");
    expect(migration).not.toContain("contact_phone");
    expect(added).toContain("license_name");
    expect(added).toContain("contact_phone");
    expect(added).toContain("CREATE TABLE merchant_profile_images");
    expect(added).not.toMatch(/INSERT INTO/i);
    expect(added).not.toMatch(/UPDATE merchant_profiles/i);
    expect(provisioning).not.toContain("merchant_profiles");
    expect(source).not.toMatch(/from ["'][^"']*\/(db|adapters|app|catalog)\//);
    expect(source).not.toMatch(/\b(postgres|drizzle|alipay|aliyun)\b/i);
  });

  it("accepts a complete license and rejects a partial or bad credit code", () => {
    const images = {
      appBaseUrl: "https://merclink.example",
      owned: [{ id: "img_license", purpose: "license" as const }],
    };
    expect(
      parseProfileBody(
        draftBody({
          license: {
            name: "示例企业",
            credit_code: "91310000MA1FL0000N",
            legal_person: "例某",
            registered_address: "示例市示例路 1 号",
            image_url: "https://merclink.example/media/img_license",
          },
          address: "经营地址与注册地址不同",
        }),
        secrets,
        images,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        address: "经营地址与注册地址不同",
        license: {
          name: "示例企业",
          creditCode: "91310000MA1FL0000N",
          legalPerson: "例某",
          registeredAddress: "示例市示例路 1 号",
          imageUrl: "https://merclink.example/media/img_license",
        },
      },
    });
    const partial = licenseBody();
    delete partial.legal_person;
    expect(parseProfileBody(draftBody({ license: partial }), secrets, images)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(
        draftBody({
          license: { ...licenseBody(), credit_code: "91310000MA1FL0000M" },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      parseProfileBody(
        draftBody({
          license: { ...licenseBody(), credit_code: "99999999999999999E" },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({
      ok: true,
      value: { license: { creditCode: "99999999999999999E" } },
    });
  });

  it("rejects an identity number, the login phone, and an image that is not an owned license", () => {
    const images = {
      appBaseUrl: "https://merclink.example",
      owned: [
        { id: "img_license", purpose: "license" as const },
        { id: "img_qr", purpose: "contact_qr" as const },
      ],
    };
    expect(
      parseProfileBody(
        draftBody({
          license: { ...licenseBody(), legal_person: "张三11010119900307777X" },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      parseProfileBody(
        draftBody({
          contact: { phone: "13800138000", label: null, qr_url: null },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      parseProfileBody(
        draftBody({
          license: {
            ...licenseBody(),
            image_url: "https://img.example/license.png",
          },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      parseProfileBody(
        draftBody({
          license: {
            ...licenseBody(),
            image_url: "https://merclink.example/media/img_catalog",
          },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "not_found" });
    expect(
      parseProfileBody(
        draftBody({
          license: {
            ...licenseBody(),
            image_url: "https://merclink.example/media/img_qr",
          },
        }),
        secrets,
        images,
      ),
    ).toMatchObject({ ok: false, error: "not_found" });
    expect(parseProfileBody(sevenFieldBody(), secrets, images)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      parseProfileBody(
        draftBody({
          published: true,
          license: null,
          contact: null,
        }),
        secrets,
        images,
      ).ok,
    ).toBe(true);
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
    license: null,
    contact: null,
    published: false,
    ...overrides,
  };
}

function licenseBody(): Record<string, string> {
  return {
    name: "示例企业",
    credit_code: "91310000MA1FL0000N",
    legal_person: "例某",
    registered_address: "示例市示例路 1 号",
    image_url: "https://merclink.example/media/img_license",
  };
}

function sevenFieldBody(): Record<string, unknown> {
  const body = draftBody();
  delete body.license;
  delete body.contact;
  return body;
}
