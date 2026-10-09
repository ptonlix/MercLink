import { describe, expect, it } from "vitest";
import { validateStaticEntries } from "./archive";
import { maxStorefrontBytes } from "./limits";
import { isReservedPath, storefrontRewritePath } from "./paths";
import { activationConfirmed, pointerAfterActivate, pointerAfterRollback } from "./pointer";
import { inspectDocument, majorUnitPrice, renderDocument, type SlotProduct } from "./slots";

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
