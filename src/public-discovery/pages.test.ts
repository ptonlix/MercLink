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
import { emptyProductsNote, merchantRegistrationNote, serviceDescription } from "./site";

const origin = "https://merclink.example";

describe("public pages", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = origin;
    resetPublicProducts();
  });

  afterEach(() => {
    resetPublicProducts();
    delete process.env.APP_BASE_URL;
  });

  it("renders the landing page without executing script", async () => {
    const product = publishedProduct();
    registerProducts([product]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const metadata = await landingMetadata();

    expect(visible).toContain(serviceDescription);
    expect(visible).toContain(merchantRegistrationNote);
    expect(visible).toContain(product.title);
    expect(visible).toContain(String(product.offer.price));
    expect(visible).toContain('href="/products"');
    expect(visible).toContain('href="/skill.md"');
    expect(visible).toContain('href="/merchant/skill.md"');
    expect(visible).toContain('href="/api/v1"');
    expect(visible).toContain('href="/llms.txt"');
    expect(visible).toContain('href="/sitemap.xml"');
    expect(metadata.title).toBe("MercLink");
    expect(visible).toContain("<h1>MercLink</h1>");
    expect(metadata.description).toBe(serviceDescription);
    expect(metadata.alternates?.canonical).toBe(`${origin}/`);

    const graph = landingGraph(html);
    const organization = graph.find((node) => node["@type"] === "Organization");
    const itemList = graph.find((node) => node["@type"] === "ItemList");
    expect(organization).toMatchObject({
      name: "MercLink",
      description: serviceDescription,
    });
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
    expect(visibleProduct).not.toContain("2599.00");
    expect(offer).toEqual({
      "@type": "Offer",
      price: product.offer.price,
      priceCurrency: product.offer.currency,
      availability: product.offer.availability,
    });
    expect(metadata.title).toBe(product.title);
    expect(metadata.description).toContain(String(product.offer.price));
    expect(metadata.description).toContain(product.offer.currency);
    expect(metadata.description).toContain(product.offer.availability);
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
    expect(offer.price).toBe(product.offer.price);
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
    expect(visible).toContain(`<img src="${product.cover}" alt="${product.title}"/>`);
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

    expect(visibleHtml(home)).toContain(serviceDescription);
    expect(visibleHtml(home)).toContain(emptyProductsNote);
    expect(visibleHtml(list)).toContain(emptyProductsNote);
    expect(home).not.toContain("/products/prd_");
    expect(list).not.toContain("/products/prd_");
    expect(landingGraph(home).find((node) => node["@type"] === "ItemList")).toMatchObject({
      numberOfItems: 0,
      itemListElement: [],
    });

    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_missing" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expectNoindexNotFound(ProductPage({ params: Promise.resolve({ id: "prd_missing" }) }));
  });
});

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
        options: { size: "42" },
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
  price: number;
  priceCurrency: string;
  availability: string;
} {
  const block = jsonLdBlocks(html)[0];
  if (!isRecord(block) || block["@type"] !== "Product" || !isRecord(block.offers)) {
    throw new Error("product JSON-LD is missing Offer");
  }
  const offer = block.offers;
  if (offer["@type"] !== "Offer") {
    throw new Error("product JSON-LD offer type mismatch");
  }
  if (
    typeof offer.price !== "number" ||
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
  };
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
