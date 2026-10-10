import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMetadata as landingMetadata, default as HomePage } from "../app/page";
import {
  generateMetadata as productMetadata,
  default as ProductPage,
} from "../app/products/[id]/page";
import { generateMetadata as listMetadata, default as ProductsPage } from "../app/products/page";
import { minorUnits } from "../shared/money";
import {
  publicProducts,
  resetPublicProducts,
  type PublicProduct,
} from "../shared/seams/public-products";
import {
  publicStore,
  resetPublicStore,
  type PublicStoreProfile,
} from "../shared/seams/public-store";
import { emptyProductsNote, storeExplanation, storeSlogan, viewAllProductsLabel } from "./site";

const origin = "https://merclink.example";

describe("public pages", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = origin;
    resetPublicProducts();
    resetPublicStore();
  });

  afterEach(() => {
    resetPublicProducts();
    resetPublicStore();
    delete process.env.APP_BASE_URL;
  });

  it("renders the landing page without executing script", async () => {
    const product = publishedProduct();
    registerProducts([product]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const metadata = await landingMetadata();

    expect(visible).toContain(product.title);
    expect(visible).toContain("USD 2599.00");
    expect(visible).toContain("有货");
    expect(visible).toContain('href="/products"');
    expect(visible).toContain('href="/skill.md"');
    expect(visible).toContain('href="/merchant/skill.md"');
    expect(visible).toContain('href="/api/v1"');
    expect(visible).toContain('href="/llms.txt"');
    expect(visible).toContain('href="/sitemap.xml"');
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf(storeSlogan));
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf('href="/skill.md"'));
    expect(visible).toContain(storeExplanation);
    expect(visible).not.toContain("查询已上架商品并下单");
    expect(visible).not.toContain("不能自助注册");
    expect(visible).not.toContain("进入这一家的店");
    expect(visible).not.toContain('href="/merchants');
    expect(metadata.title).toBe("MercLink");
    expect(visible).not.toContain("<h1>MercLink</h1>");
    expect(metadata.description).toBe(storeExplanation);
    expect(metadata.alternates?.canonical).toBe(`${origin}/`);

    const graph = landingGraph(html);
    expect(graph.find((node) => node["@type"] === "Organization")).toBeUndefined();
    expect(graph.find((node) => node["@type"] === "OnlineStore")).toBeUndefined();
    const itemList = graph.find((node) => node["@type"] === "ItemList");
    expect(itemList).toMatchObject({
      numberOfItems: 1,
      itemListElement: [
        {
          name: product.title,
          url: `${origin}/products/${product.id}`,
        },
      ],
    });
  });

  it("renders seam products and keeps the offer in minor units", async () => {
    const product = publishedProduct();
    registerProducts([product]);

    const listHtml = renderToStaticMarkup(await ProductsPage({}));
    const productHtml = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const visibleProduct = visibleHtml(productHtml);
    const metadata = await productMetadata({ params: Promise.resolve({ id: product.id }) });
    const offer = productOffer(productHtml);

    expect(visibleHtml(listHtml)).toContain(product.title);
    expect(visibleProduct).toContain(product.title);
    expect(visibleProduct).toContain(product.id);
    expect(visibleProduct).toContain(product.catalogId);
    expect(visibleProduct).toContain("weight_g");
    expect(visibleProduct).toContain("480");
    expect(visibleProduct).toContain("var_sentinel");
    expect(visibleProduct).toContain("size=42");
    expect(visibleProduct).toContain(String(product.offer.price));
    expect(visibleProduct).toContain(product.offer.currency);
    expect(visibleProduct).toContain(product.offer.availability);
    expect(visibleProduct).toContain("USD 2599.00");
    expect(visibleHtml(listHtml)).toContain("USD 2599.00");
    expect(offer).toEqual({
      "@type": "Offer",
      price: "2599.00",
      priceCurrency: product.offer.currency,
      availability: "https://schema.org/InStock",
      sku: "SENTINEL-42",
    });
    expect(metadata.title).toBe(product.title);
    expect(metadata.description).toBe("哨兵短靴。USD 2599.00，有货");
    expect(metadata.description).not.toContain("分");
    expect(metadata.description).not.toContain("in_stock");
    expect(metadata).not.toHaveProperty("seoDescription");
    expect(metadata.alternates?.canonical).toBe(`${origin}/products/${product.id}`);
    expect(listMetadata).toBeTypeOf("function");
    const listMeta = await listMetadata();
    expect(listMeta.alternates?.canonical).toBe(`${origin}/products`);
    expect(visibleHtml(listHtml)).toContain(String(listMeta.description));
  });

  it("does not let a product title break out of JSON-LD", async () => {
    const product = publishedProduct();
    product.title = "哨兵</script><script>alert(1)";
    registerProducts([product]);

    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );

    expect(html).not.toContain("</script><script>");
    const offer = productOffer(html);
    expect(offer.price).toBe("2599.00");
    expect(offer.availability).toBe("https://schema.org/InStock");
  });

  it("returns a noindex 404 when the seam does not return the product", async () => {
    const hiddenPrice = 424242;
    registerProducts([publishedProduct()]);

    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_hidden" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(metadata)).not.toContain(String(hiddenPrice));
    expect(JSON.stringify(metadata)).not.toContain("in_stock");

    await expectNoindexNotFound(ProductPage({ params: Promise.resolve({ id: "prd_hidden" }) }));
  });

  it("renders an http cover as an image and omits img when the cover is empty", async () => {
    const product = publishedProduct();
    registerProducts([product]);
    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const visible = visibleHtml(html);
    expect(visible).toContain(`src="${product.cover}" alt="${product.title}"`);
    const block = jsonLdBlocks(html)[0];
    expect(isRecord(block) ? block.image : undefined).toBe(product.cover);

    const empty = publishedProduct();
    empty.id = "prd_empty_cover";
    empty.cover = null;
    registerProducts([empty]);
    const emptyHtml = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: empty.id }) }),
    );
    expect(emptyHtml).not.toContain("<img");
  });

  it("renders an empty success page when the seam is unregistered", async () => {
    resetPublicProducts();

    const home = renderToStaticMarkup(await HomePage());
    const list = renderToStaticMarkup(await ProductsPage({}));

    expect(visibleHtml(home)).toContain(storeExplanation);
    expect(visibleHtml(home)).toContain(emptyProductsNote);
    expect(visibleHtml(home)).not.toContain("查询已上架商品并下单");
    expect(visibleHtml(home)).not.toContain("不能自助注册");
    expect(visibleHtml(list)).toContain(emptyProductsNote);
    expect(home).not.toContain("/products/prd_");
    expect(list).not.toContain("/products/prd_");
    expect(landingGraph(home).find((node) => node["@type"] === "ItemList")).toMatchObject({
      numberOfItems: 0,
      itemListElement: [],
    });
    expect(landingGraph(home).find((node) => node["@type"] === "OnlineStore")).toBeUndefined();

    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_missing" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expectNoindexNotFound(ProductPage({ params: Promise.resolve({ id: "prd_missing" }) }));
  });

  it("opens with the published store and keeps secrets out of the page", async () => {
    const summary = "甲".repeat(160);
    const store = publishedStore({
      summary,
      logoUrl: "https://cdn.example/logo.png",
      areaServed: "杭州市",
      address: "西湖区某某路 88 号",
      websiteUrl: "https://shop.example",
    });
    publicStore.register({ get: () => Promise.resolve(store) });
    const product = publishedProduct();
    registerProducts([product]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const metadata = await landingMetadata();
    const onlineStore = landingGraph(html).find((node) => node["@type"] === "OnlineStore");

    expect(visible.indexOf(store.displayName)).toBeLessThan(visible.indexOf(store.summary));
    expect(visible.indexOf(store.summary)).toBeLessThan(visible.indexOf(product.title));
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf(storeSlogan));
    expect(visible).toMatch(/<h1[^>]*>南风商店<\/h1>/);
    expect(visible).toContain("https://cdn.example/logo.png");
    expect(visible).toContain("杭州市");
    expect(visible).toContain("西湖区某某路 88 号");
    expect(visible).toContain("https://shop.example");
    expect(visible).not.toContain("13800138000");
    expect(visible).not.toContain("secret@example.com");
    expect(visible).not.toContain("password_hash");
    expect(visible).not.toContain("不能自助注册");
    expect(visible).not.toContain("进入这一家的店");
    expect(visible).not.toContain("/merchants/");
    expect(metadata.title).toBe(store.displayName);
    expect(metadata.description).toBe(Array.from(summary).slice(0, 150).join(""));
    expect(String(metadata.description)).toHaveLength(150);
    expect(visible).toContain(summary);
    expect(metadata.alternates?.canonical).toBe(`${origin}/`);
    expect(onlineStore).toMatchObject({
      name: store.displayName,
      description: summary,
      url: `${origin}/`,
      logo: store.logoUrl,
      sameAs: store.websiteUrl,
      areaServed: store.areaServed,
      address: { "@type": "PostalAddress", streetAddress: store.address },
    });
    expect(JSON.stringify(onlineStore)).not.toContain("13800138000");
  });

  it("omits empty logo, area, address, and website", async () => {
    publicStore.register({
      get: () =>
        Promise.resolve(
          publishedStore({
            logoUrl: null,
            areaServed: null,
            address: null,
            websiteUrl: null,
          }),
        ),
    });
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const onlineStore = landingGraph(html).find((node) => node["@type"] === "OnlineStore");
    expect(visible).not.toContain('class="logo"');
    expect(visible).not.toContain('class="area"');
    expect(visible).not.toContain('class="address"');
    expect(visible).not.toContain('class="website"');
    expect(onlineStore).not.toHaveProperty("logo");
    expect(onlineStore).not.toHaveProperty("sameAs");
    expect(onlineStore).not.toHaveProperty("areaServed");
    expect(onlineStore).not.toHaveProperty("address");
  });

  it("shows two product cards in yuan and keeps them without script", async () => {
    const boots = publishedProduct();
    boots.offer = {
      ...boots.offer,
      currency: "CNY",
      price: minorUnits(159900),
      availability: "in_stock",
    };
    const cup = publishedProduct();
    cup.id = "prd_cup";
    cup.title = "哨兵杯子";
    cup.cover = null;
    cup.offer = {
      ...cup.offer,
      currency: "CNY",
      price: minorUnits(800),
      availability: "out_of_stock",
    };
    registerProducts([boots, cup]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);

    expect(visible).toContain("¥1599.00");
    expect(visible).toContain("¥8.00");
    expect(visible).toContain("有货");
    expect(visible).toContain("缺货");
    expect(visible).toContain(`href="/products/${boots.id}"`);
    expect(visible).toContain(`href="/products/${cup.id}"`);
    expect(visible).toContain("placeholder");
    expect(visible).not.toContain(">无<");
    expect(visible).toContain(viewAllProductsLabel);
    expect(html).not.toContain("linear-gradient");
    expect(html).not.toContain("autoplay");
    expect(visible.indexOf(boots.title)).toBeLessThan(visible.indexOf(storeSlogan));
  });

  it("links to the product list when the shelf has another page", async () => {
    const products = ["甲", "乙", "丙", "丁", "戊"].map((title, index) => {
      const product = publishedProduct();
      product.id = `prd_shelf_${String(index)}`;
      product.title = title;
      return product;
    });
    registerProducts(products);
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    expect(visible).toContain(viewAllProductsLabel);
    expect(visible).toContain('href="/products"');
    expect(products.every((product) => visible.includes(`href="/products/${product.id}"`))).toBe(
      true,
    );
  });

  it("drops a withdrawn store profile from the landing page", async () => {
    publicStore.register({ get: () => Promise.resolve(publishedStore()) });
    const shown = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(shown).toContain("南风商店");

    resetPublicStore();
    const html = renderToStaticMarkup(await HomePage());
    const withdrawn = visibleHtml(html);
    expect(withdrawn).not.toContain("南风商店");
    expect(withdrawn).not.toContain("可以直接交给 Agent 购买");
    expect(landingGraph(html).find((node) => node["@type"] === "OnlineStore")).toBeUndefined();
  });
  it("keeps both ordered role guides and the more link in server HTML even without products", async () => {
    const visible = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(visible).toContain(viewAllProductsLabel);
    expect(visible).toContain("如何使用 MercLink");
    expect(visible).toContain("把买家 Skill 交给 Agent");
    expect(visible).toContain("把商家 Skill 交给 Agent");
    expect(visible).toContain("首次登录先修改初始密码");
    expect(visible).toContain("打开付款链接不表示支付成功");
    expect(visible.indexOf(viewAllProductsLabel)).toBeLessThan(
      visible.indexOf("如何使用 MercLink"),
    );
    expect((visible.match(/<ol/g) ?? []).length).toBe(2);
    expect((visible.match(/<li>/g) ?? []).length).toBe(8);
    expect(visible).toContain(`${origin}/skill.md`);
    expect(visible).toContain(`${origin}/merchant/skill.md`);
    expect(visible).not.toContain("prd_demo");
  });

  it("shows all variant facts without script and does not submit a display price", async () => {
    const product = publishedProduct();
    product.fields = { enabled: true, optional: null };
    const variant = product.variants[0];
    if (variant === undefined) throw new Error("Fixture requires a variant");
    product.variants = [
      { ...variant, id: "var_unlimited", stock: null, sku: "SKU-1" },
      { ...variant, id: "var_empty", stock: 0, availability: "out_of_stock" },
    ];
    registerProducts([product]);
    const visible = visibleHtml(
      renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) })),
    );
    expect(visible).toContain("var_unlimited");
    expect(visible).toContain("var_empty");
    expect(visible).toContain("不限库存");
    expect(visible).toContain("缺货");
    expect(visible).toContain("SKU-1");
    expect(visible).toContain(">是<");
    expect(visible).toContain("未填写");
    expect(visible).not.toContain('action="/api/v1/orders"');
    expect(visible).not.toContain('name="price"');
  });

  it("formats CNY minor units for people while preserving the structured offer", async () => {
    const product = publishedProduct();
    product.offer = { price: minorUnits(15900), currency: "CNY", availability: "in_stock" };
    product.currency = "CNY";
    const variant = product.variants[0];
    if (variant === undefined) throw new Error("Fixture requires a variant");
    product.variants = [{ ...variant, price: minorUnits(15900), currency: "CNY" }];
    registerProducts([product]);
    const list = visibleHtml(renderToStaticMarkup(await ProductsPage({})));
    const detail = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    expect(list).toContain("¥159.00");
    expect(visibleHtml(detail)).toContain("¥159.00");
    expect(productOffer(detail).price).toBe("159.00");
    expect(product.offer.price).toBe(15900);
  });

  it("uses the returned cursor for regular pagination", async () => {
    publicProducts.register({
      list: () => Promise.resolve({ items: [publishedProduct()], nextCursor: "cursor+/=" }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const visible = visibleHtml(renderToStaticMarkup(await ProductsPage({})));
    expect(visible).toContain('href="/products?cursor=cursor%2B%2F%3D"');
    expect(visible).toContain("下一页商品");
  });
});

function publishedStore(overrides: Partial<PublicStoreProfile> = {}): PublicStoreProfile {
  return {
    displayName: "南风商店",
    summary: "可以直接交给 Agent 购买。",
    websiteUrl: null,
    logoUrl: null,
    areaServed: null,
    address: null,
    ...overrides,
  };
}

function publishedProduct(): PublicProduct {
  return {
    id: "prd_sentinel",
    catalogId: "cat_sentinel",
    title: "哨兵短靴",
    cover: "https://cdn.example/sentinel.png",
    currency: "USD",
    offer: {
      price: minorUnits(259900),
      currency: "USD",
      availability: "in_stock",
    },
    fields: { weight_g: 480, waterproof: true, note: null },
    variants: [
      {
        id: "var_sentinel",
        price: minorUnits(259900),
        currency: "USD",
        stock: 4,
        availability: "in_stock",
        optionValues: { size: "42" },
        sku: "SENTINEL-42",
      },
    ],
  };
}

function registerProducts(items: readonly PublicProduct[]): void {
  publicProducts.register({
    list: () => Promise.resolve({ items, nextCursor: null }),
    get: (id) => {
      const product = items.find((item) => item.id === id);
      if (product === undefined) {
        return Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" });
      }
      return Promise.resolve({ ok: true, product });
    },
  });
}

function visibleHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
}

function landingGraph(html: string): Record<string, unknown>[] {
  const block = jsonLdBlocks(html)[0];
  if (!isRecord(block) || !Array.isArray(block["@graph"])) {
    throw new Error("landing JSON-LD is missing @graph");
  }
  return block["@graph"].filter(isRecord);
}

function productOffer(html: string): {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  sku?: string;
} {
  const offers = productOffers(html);
  const offer = offers[0];
  if (offer === undefined) {
    throw new Error("product JSON-LD is missing Offer");
  }
  return offer;
}

function productOffers(html: string): {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  sku?: string;
}[] {
  const block = jsonLdBlocks(html)[0];
  if (!isRecord(block) || block["@type"] !== "Product" || !Array.isArray(block.offers)) {
    throw new Error("product JSON-LD is missing Offer");
  }
  return block.offers.map((offer) => {
    if (!isRecord(offer) || offer["@type"] !== "Offer") {
      throw new Error("product JSON-LD offer type mismatch");
    }
    if (
      typeof offer.price !== "string" ||
      typeof offer.priceCurrency !== "string" ||
      typeof offer.availability !== "string"
    ) {
      throw new Error("product JSON-LD offer fields mismatch");
    }
    return {
      "@type": "Offer",
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      availability: offer.availability,
      ...(typeof offer.sku === "string" ? { sku: offer.sku } : {}),
    };
  });
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const raw = match[1];
    if (raw === undefined) {
      continue;
    }
    blocks.push(JSON.parse(raw));
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function expectNoindexNotFound(result: Promise<unknown>): Promise<void> {
  try {
    await result;
  } catch (error: unknown) {
    expect(isNoindexNotFound(error)).toBe(true);
    return;
  }
  throw new Error("expected a noindex 404");
}

function isNoindexNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("NEXT_HTTP_ERROR_FALLBACK;404") &&
    "digest" in error &&
    error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}
