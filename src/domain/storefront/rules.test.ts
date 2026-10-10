import { describe, expect, it } from "vitest";
import { validateStaticEntries } from "./archive";
import { maxStorefrontBytes } from "./limits";
import { isReservedPath, storefrontRewritePath } from "./paths";
import { activationConfirmed, pointerAfterActivate, pointerAfterRollback } from "./pointer";
import {
  containsMerchantJsonLd,
  documentDeclaresProductSlots,
  documentDeclaresStoreSlots,
  documentHasSlots,
  inspectDocument,
  majorUnitPrice,
  renderDocument,
  stripMerchantJsonLd,
  type SlotProduct,
} from "./slots";

const productSlots = [
  "product.name",
  "product.cover",
  "product.fields",
  "product.variants",
  "product.stock",
  "product.availability",
  "product.price",
]
  .map((name) => `<merclink-slot name="${name}"></merclink-slot>`)
  .join("");

describe("storefront rules", () => {
  it("keeps protocol paths on the server and refuses product fallback", () => {
    expect(storefrontRewritePath("/oauth/device/auth", true)).toBeNull();
    expect(storefrontRewritePath("/api/v1/payments/alipay/notify", true)).toBeNull();
    expect(storefrontRewritePath("/authorize/buyer", true)).toBeNull();
    expect(storefrontRewritePath("/admin", true)).toBeNull();
    expect(storefrontRewritePath("/media/img_1", true)).toBeNull();
    expect(storefrontRewritePath("/skill.md", true)).toBeNull();
    expect(storefrontRewritePath("/storefront/skill.md", true)).toBeNull();
    expect(isReservedPath("/products/prd_1")).toBe(false);
    expect(storefrontRewritePath("/about", false)).toBeNull();
    expect(storefrontRewritePath("/about", true)).toBe("/storefront-asset");
    expect(activationConfirmed(true)).toBe(true);
    expect(activationConfirmed(false)).toBe(false);
    expect(activationConfirmed(undefined)).toBe(false);
  });

  it("rejects reserved paths, secrets, missing index, and oversized static sets", () => {
    expect(
      validateStaticEntries([{ path: "api/hack.html", bytes: text("<p></p>") }]),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(validateStaticEntries([{ path: ".env", bytes: text("TOKEN=1") }])).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(validateStaticEntries([{ path: "about.html", bytes: text("<p></p>") }])).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      validateStaticEntries([
        { path: "index.html", bytes: new Uint8Array(maxStorefrontBytes + 1) },
      ]),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(validateStaticEntries([{ path: "index.html", bytes: text("<p>hi</p>") }]).ok).toBe(true);
  });

  it("blocks hardcoded facts and renders the next fact without another activation", () => {
    expect(
      inspectDocument(
        "index.html",
        '<script type="application/ld+json">{"@type":"OnlineStore"}</script>',
      ),
    ).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("index.html", "<p>¥12.00</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("index.html", "<p>店名：南风</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("index.html", "<p>支付成功</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("products/item.html", "<p>商品</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("products/item.html", productSlots).ok).toBe(true);
    expect(inspectDocument("index.html", "<p>售价 1599.00</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("index.html", "<p>单价：12</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("index.html", "<p>标价 8</p>")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(inspectDocument("products/index.html", productSlots)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      inspectDocument(
        "products/index.html",
        `${productSlots}<merclink-slot name="products.next"></merclink-slot>`,
      ).ok,
    ).toBe(true);

    const product = slotProduct(159900, "旧介绍");
    const first = renderDocument(
      `<p><merclink-slot name="product.price"></merclink-slot></p><p><merclink-slot name="store.summary"></merclink-slot></p><merclink-slot name="products.next"></merclink-slot>`,
      {
        store: {
          displayName: "店",
          summary: "旧介绍",
          logo: null,
          website: null,
          area: null,
          address: null,
        },
        products: [],
        product,
        orderStatus: "pending",
        nextCursor: null,
      },
    );
    const second = renderDocument(
      `<p><merclink-slot name="product.price"></merclink-slot></p><p><merclink-slot name="store.summary"></merclink-slot></p><merclink-slot name="products.next"></merclink-slot>`,
      {
        store: {
          displayName: "店",
          summary: "新介绍",
          logo: null,
          website: null,
          area: null,
          address: null,
        },
        products: [],
        product: slotProduct(800, "新介绍"),
        orderStatus: "paid",
        nextCursor: "page-2",
      },
    );
    expect(first).toContain("¥1599.00");
    expect(first).toContain("旧介绍");
    expect(second).toContain("¥8.00");
    expect(second).toContain("新介绍");
    expect(second).not.toContain("¥1599.00");
    expect(first).not.toContain("products.next");
    expect(first).not.toContain("cursor=");
    expect(second).toContain('href="/products?cursor=page-2"');
    expect(majorUnitPrice(800)).toBe("¥8.00");
    const shaped = renderDocument(
      `<template data-merclink="product.field"><span><merclink-slot name="field.key"></merclink-slot>:<merclink-slot name="field.value"></merclink-slot></span></template><template data-merclink="product.variant"><i><merclink-slot name="variant.id"></merclink-slot></i></template>`,
      {
        store: null,
        products: [],
        product: {
          ...slotProduct(800, "新介绍"),
          fields: { origin: "合浦" },
          variants: [
            {
              id: "var_1",
              optionValues: {},
              stock: 1,
              availability: "in_stock",
              priceMinor: 800,
            },
          ],
        },
        orderStatus: null,
        nextCursor: null,
      },
    );
    expect(shaped).toContain("origin:合浦");
    expect(shaped).toContain("var_1");
    expect(shaped).not.toContain("<dl");
    expect(shaped).not.toContain("规格 ID");
  });

  it("rejects encoded JSON-LD types and strips unclosed scripts without touching prose", () => {
    const forms = [
      "application/ld&#43;json",
      "application&#47;ld+json",
      "application/ld&#x2B;json",
      "application&#47;ld&#x2b;json",
      "Application/LD&#43;JSON",
      "application/ld&#43json",
      "application/ld&plus;json",
      "application&sol;ld+json",
      "application&sol;ld&plus;json",
    ];
    for (const type of forms) {
      const html = `<p>keep</p><script type="${type}">{"price":"424242.00"}</script><p>after</p>`;
      expect(containsMerchantJsonLd(html)).toBe(true);
      expect(stripMerchantJsonLd(html)).toBe("<p>keep</p><p>after</p>");
      expect(inspectDocument("index.html", html)).toMatchObject({
        ok: false,
        error: "validation_error",
      });
    }
    expect(containsMerchantJsonLd("<script type='application/ld&#43;json'></script>")).toBe(true);
    expect(containsMerchantJsonLd("<script type=application/ld&#43;json></script>")).toBe(true);
    expect(containsMerchantJsonLd('<script id="x" type="application/ld&#43;json"></script>')).toBe(
      true,
    );
    expect(
      containsMerchantJsonLd('<script data-x=">" type="application/ld&#43;json"></script>'),
    ).toBe(true);

    const unclosed =
      '<p>keep</p><script type="application/ld+json">{"price":"424242.00"}<p>tail</p>';
    expect(containsMerchantJsonLd(unclosed)).toBe(true);
    expect(stripMerchantJsonLd(unclosed)).toBe("<p>keep</p>");
    expect(stripMerchantJsonLd(unclosed)).not.toContain("424242");
    const unclosedEncoded =
      '<p>keep</p><script type="application/ld&#x2B;json">{"price":"424242.00"}';
    expect(stripMerchantJsonLd(unclosedEncoded)).toBe("<p>keep</p>");

    const prose = "<p>正文提到 application/ld+json，标价说明 424242 仍应保留。</p>";
    expect(containsMerchantJsonLd(prose)).toBe(false);
    expect(stripMerchantJsonLd(prose)).toBe(prose);
    const plainScript =
      '<script type="text/javascript">application/ld+json 424242</script><p>after</p>';
    expect(containsMerchantJsonLd(plainScript)).toBe(false);
    expect(stripMerchantJsonLd(plainScript)).toBe(plainScript);
    expect(containsMerchantJsonLd('<script type="application/ld+jsonextra"></script>')).toBe(false);
    expect(containsMerchantJsonLd('<div type="application/ld+json"></div>')).toBe(false);
    expect(containsMerchantJsonLd('<script type="application/ld&amp;plus;json"></script>')).toBe(
      false,
    );
    expect(containsMerchantJsonLd('<script type="application&amp;sol;ld+json"></script>')).toBe(
      false,
    );

    const hiddenSlots = [
      "<p>MARKETING</p>",
      '<script type="application/ld&#43;json">',
      '<merclink-slot name="product.name"></merclink-slot>',
      '<merclink-slot name="store.display_name"></merclink-slot>',
      '{"price":"424242.00"}',
      "</script>",
    ].join("");
    const stripped = stripMerchantJsonLd(hiddenSlots);
    expect(stripped).toBe("<p>MARKETING</p>");
    expect(stripped).not.toContain("424242");
    expect(documentHasSlots(stripped)).toBe(false);
    expect(documentDeclaresProductSlots(stripped)).toBe(false);
    expect(documentDeclaresStoreSlots(stripped)).toBe(false);

    const kept = stripMerchantJsonLd(
      `<script type="application/ld+json">{"price":"424242.00"}</script>${productSlots}`,
    );
    expect(kept).toBe(productSlots);
    expect(kept).not.toContain("424242");
    expect(documentDeclaresProductSlots(kept)).toBe(true);
  });

  it("moves only the pointer on activate and rollback", () => {
    const activated = pointerAfterActivate({ activeId: "sfr_old", previousId: null }, "sfr_new");
    expect(activated).toEqual({ activeId: "sfr_new", previousId: "sfr_old" });
    expect(pointerAfterRollback(activated)).toEqual({ activeId: "sfr_old", previousId: null });
    expect(pointerAfterRollback({ activeId: "sfr_old", previousId: null })).toEqual({
      activeId: null,
      previousId: null,
    });
  });
});

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function slotProduct(priceMinor: number, name: string): SlotProduct {
  return {
    id: "prd_1",
    name,
    cover: null,
    fields: {},
    variants: [],
    stock: 3,
    availability: "in_stock",
    priceMinor,
  };
}
