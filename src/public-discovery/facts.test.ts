import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { generateMetadata as listMetadata, default as ProductsPage } from "../app/products/page";
import { default as ProductPage } from "../app/products/[id]/page";
import { GET as landingMarkdown } from "../app/markdown/landing/route";
import { GET as listMarkdown } from "../app/markdown/list/route";
import { GET as productMarkdown } from "../app/markdown/products/[id]/route";
import sitemap from "../app/sitemap";
import { proxy } from "../proxy";
import { minorUnits } from "../shared/money";
import {
  publicProducts,
  resetPublicProducts,
  type PublicProduct,
} from "../shared/seams/public-products";
import { resetPublicStore } from "../shared/seams/public-store";
import { landingMarkdownResponse, listMarkdownResponse, productMarkdownResponse } from "./markdown";
import { loadProduct } from "./model";
import { markdownRewritePath } from "./negotiate";
import { majorUnitDecimal } from "./presentation";

const origin = "https://merclink.example";

describe("public fact discovery", () => {
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

  it("converts minor units once at the output boundary", () => {
    expect(majorUnitDecimal(159900)).toBe("1599.00");
    expect(majorUnitDecimal(800)).toBe("8.00");
    expect(minorUnits(159900)).toBe(159900);
    expect(minorUnits(800)).toBe(800);
  });

  it("publishes one offer per sellable variant without invented identifiers", async () => {
    const product = pricedProduct("prd_pair", "双规格");
    product.variants = [
      variant("var_boots", 159900, "in_stock", "BOOT-42"),
      variant("var_cup", 800, "out_of_stock", null),
    ];
    register([product]);

    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const block = jsonLd(html);
    const offers = Array.isArray(block.offers) ? block.offers : [];

    expect(offers).toEqual([
      {
        "@type": "Offer",
        price: "1599.00",
        priceCurrency: "CNY",
        availability: "https://schema.org/InStock",
        sku: "BOOT-42",
      },
      {
        "@type": "Offer",
        price: "8.00",
        priceCurrency: "CNY",
        availability: "https://schema.org/OutOfStock",
      },
    ]);
    expect(JSON.stringify(block)).not.toMatch(
      /"brand"|"gtin"|"aggregateRating"|"shippingRate"|"hasMerchantReturnPolicy"|"in_stock"|"out_of_stock"/,
    );
    expect(html).toContain("¥1599.00");
    expect(html).toContain("¥8.00");
  });

  it("truncates the product description and does not store SEO copy", async () => {
    const product = pricedProduct("prd_long", "甲".repeat(180));
    product.offer = { price: minorUnits(800), currency: "CNY", availability: "out_of_stock" };
    product.variants = [variant("var_long", 800, "out_of_stock", null)];
    register([product]);
    const model = await loadProduct(product.id);
    expect(model.kind).toBe("visible");
    if (model.kind !== "visible") {
      return;
    }
    expect(model.description).toHaveLength(150);
    expect(model.description.startsWith("甲")).toBe(true);
    expect(model.description).not.toContain("分");
    expect(model.description).not.toContain("in_stock");
    expect(model.description).not.toContain("out_of_stock");
    expect(model).not.toHaveProperty("seoDescription");
  });

  it("keeps a cursor page canonical and out of the next item list", async () => {
    const current = pricedProduct("prd_now", "当前页");
    const later = pricedProduct("prd_later", "下一页不该出现");
    publicProducts.register({
      list: (query) => {
        if (query.cursor === "page-2") {
          return Promise.resolve({ items: [current], nextCursor: "page-3" });
        }
        return Promise.resolve({ items: [later], nextCursor: "page-2" });
      },
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });

    const first = await listMetadata();
    expect(first.alternates?.canonical).toBe(`${origin}/products`);
    expect(first.pagination?.previous).toBeUndefined();
    expect(first.pagination?.next).toBe(`${origin}/products?cursor=page-2`);

    const second = await listMetadata({
      searchParams: Promise.resolve({ cursor: "page-2" }),
    });
    expect(second.alternates?.canonical).toBe(`${origin}/products?cursor=page-2`);
    expect(second.alternates?.canonical).not.toBe(`${origin}/products`);
    expect(second.pagination?.previous).toBe(`${origin}/products`);
    expect(second.pagination?.next).toBe(`${origin}/products?cursor=page-3`);

    const html = renderToStaticMarkup(
      await ProductsPage({ searchParams: Promise.resolve({ cursor: "page-2" }) }),
    );
    expect(html).toContain(
      'rel="canonical" href="https://merclink.example/products?cursor=page-2"',
    );
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).not.toContain('rel="prev" href="https://merclink.example/products?cursor=page-2"');
    const block = jsonLd(html);
    const names = Array.isArray(block.itemListElement)
      ? block.itemListElement.map((item) => (isRecord(item) ? item.name : ""))
      : [];
    expect(names).toEqual(["当前页"]);
    expect(names).not.toContain("下一页不该出现");
    expect(html).toContain('rel="alternate" type="text/markdown"');
    expect(html).toContain('rel="describedby" href="/llms.txt"');
  });

  it("serves the same markdown from the suffix and the accept header without querying the suffix", async () => {
    const product = pricedProduct("prd_md", "杯子");
    product.offer = { price: minorUnits(800), currency: "CNY", availability: "in_stock" };
    product.variants = [variant("var_md", 800, "in_stock", "CUP")];
    const seen: string[] = [];
    publicProducts.register({
      list: () => Promise.resolve({ items: [product], nextCursor: null }),
      get: (id) => {
        seen.push(id);
        return id === product.id
          ? Promise.resolve({ ok: true, product })
          : Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" });
      },
    });

    expect(markdownRewritePath("/products.md", null)).toBe("/markdown/list");
    expect(markdownRewritePath("/products/prd_md.md", null)).toBe("/markdown/products/prd_md");
    expect(markdownRewritePath("/products/prd_md", "text/markdown")).toBe(
      "/markdown/products/prd_md",
    );
    expect(markdownRewritePath("/", "text/markdown")).toBe("/markdown/landing");
    expect(markdownRewritePath("/index.md", "text/html")).toBe("/markdown/landing");
    expect(markdownRewritePath("/products/foo.bar.md", null)).toBe("/markdown/hidden");

    const hidden = await loadProduct("prd_md.md");
    expect(hidden.kind).toBe("hidden");
    expect(seen).toEqual([]);
    const dotted = await productMarkdownResponse("prd_md.md");
    expect(dotted.status).toBe(404);
    expect(seen).toEqual([]);

    const fromPath = await productMarkdown(new Request(`${origin}/markdown/products/prd_md`), {
      params: Promise.resolve({ id: "prd_md" }),
    });
    const fromAcceptTarget = await productMarkdownResponse("prd_md");
    expect(await fromPath.text()).toBe(await fromAcceptTarget.text());
    expect(seen).toEqual(["prd_md", "prd_md"]);

    const listDirect = await listMarkdown(new Request(`${origin}/products.md`));
    const listAccept = await listMarkdownResponse(new Request(`${origin}/products.md`));
    expect(await listDirect.text()).toBe(await listAccept.text());
    const landingDirect = await landingMarkdown();
    const landingAccept = await landingMarkdownResponse();
    expect(await landingDirect.text()).toBe(await landingAccept.text());

    const suffixRewrite = await proxy(new NextRequest(`${origin}/products/prd_md.md`));
    expect(suffixRewrite.headers.get("x-middleware-rewrite")).toContain(
      "/markdown/products/prd_md",
    );
    const acceptRewrite = await proxy(
      new NextRequest(`${origin}/products/prd_md`, { headers: { accept: "text/markdown" } }),
    );
    expect(acceptRewrite.headers.get("x-middleware-rewrite")).toContain(
      "/markdown/products/prd_md",
    );
    const listRewrite = await proxy(new NextRequest(`${origin}/products.md`));
    expect(listRewrite.headers.get("x-middleware-rewrite")).toContain("/markdown/list");
    expect(listRewrite.headers.get("x-middleware-rewrite")).not.toContain("prd_");
  });

  it("shows the same major-unit price in markdown and hides unpublished offers", async () => {
    const product = pricedProduct("prd_eight", "八元杯");
    product.offer = { price: minorUnits(800), currency: "CNY", availability: "out_of_stock" };
    product.variants = [variant("var_eight", 800, "out_of_stock", null)];
    register([product]);

    const body = await (await productMarkdownResponse(product.id)).text();
    expect(body).toContain("¥8.00");
    expect(body).toContain("缺货");
    expect(body).not.toContain("800");
    expect(body).not.toContain("订单");
    expect(body).not.toContain("Bearer");
    expect(body).not.toContain("paid");
    const headers = (await productMarkdownResponse(product.id)).headers;
    expect(headers.get("link")).toContain(`${origin}/products/${product.id}`);
    expect(headers.get("link")).toContain('rel="canonical"');
    expect(headers.get("content-type")).toContain("text/markdown");

    const hidden = await productMarkdownResponse("prd_hidden");
    const hiddenBody = await hidden.text();
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("x-robots-tag")).toContain("noindex");
    expect(hiddenBody).not.toContain("¥");
    expect(hiddenBody).not.toContain("800");
    expect(existsSync("src/app/llms-full.txt")).toBe(false);

    const entries = await sitemap();
    expect(
      entries.some((entry) =>
        /\/index\.md$|\/products\.md$|\/products\/[^/]+\.md$/.test(entry.url),
      ),
    ).toBe(false);
  });
});

function pricedProduct(id: string, title: string): PublicProduct {
  return {
    id,
    catalogId: "cat_facts",
    title,
    cover: null,
    currency: "CNY",
    offer: { price: minorUnits(159900), currency: "CNY", availability: "in_stock" },
    fields: {},
    variants: [variant("var_default", 159900, "in_stock", null)],
  };
}

function variant(
  id: string,
  price: number,
  availability: "in_stock" | "out_of_stock",
  sku: string | null,
): PublicProduct["variants"][number] {
  return {
    id,
    price: minorUnits(price),
    currency: "CNY",
    stock: availability === "in_stock" ? 2 : 0,
    availability,
    optionValues: { size: id },
    sku,
  };
}

function register(items: readonly PublicProduct[]): void {
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

function jsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const raw = match?.[1];
  if (raw === undefined) {
    throw new Error("missing JSON-LD");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("JSON-LD is not an object");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
