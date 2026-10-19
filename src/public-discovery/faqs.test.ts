import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import HomePage, { generateMetadata as homeMetadata } from "../app/page";
import ProductPage, { generateMetadata as productMetadata } from "../app/products/[id]/page";
import ProductNotFound from "../app/products/not-found";
import ProductsPage from "../app/products/page";
import { inspectDocument, renderDocument, type SlotContext } from "../domain/storefront/slots";
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
import { landingMarkdownResponse, listMarkdownResponse, productMarkdownResponse } from "./markdown";
import { renderStarterFragments } from "./render-starter";
import {
  faqHeading,
  productFactsHeading,
  productShelfHeading,
  publicPagePaths,
  storeExplanation,
} from "./site";

const storeQuestion = "全店问题";
const storeAnswer = "全店答案 <script>";
const productQuestion = "商品问题";
const productAnswer = "商品答案";

describe("public faq pages", () => {
  afterEach(() => {
    resetPublicStore();
    resetPublicProducts();
  });

  it("renders store faqs under the shelf and omits the heading when empty", async () => {
    registerStore(publishedStore(), [{ question: storeQuestion, answer: storeAnswer }]);
    registerProducts([
      sampleProduct("prd_shelf", [{ question: productQuestion, answer: productAnswer }]),
    ]);
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    expect(visible.indexOf(`>${productShelfHeading}<`)).toBeLessThan(
      visible.indexOf(storeQuestion),
    );
    expect(visible.indexOf(storeQuestion)).toBeLessThan(visible.indexOf(">联系</h2>"));
    expect(visible.indexOf(">联系</h2>")).toBeLessThan(visible.indexOf("如何使用 MercLink"));
    expect(visible.match(new RegExp(`<h2>${faqHeading}</h2>`, "g"))).toEqual([
      `<h2>${faqHeading}</h2>`,
    ]);
    expect(visible.indexOf(`<h2>${faqHeading}</h2>`)).toBeLessThan(visible.indexOf(storeQuestion));
    expect(visible).toContain(`<h3>${storeQuestion}</h3>`);
    expect(visible).toContain('class="faq"');
    expect(
      visible.match(/<details\b[^>]*>/g)?.filter((tag) => tag.includes("open")) ?? [],
    ).toHaveLength(0);
    expect(visible).toContain('name="faq"');
    expect(html).toContain("全店答案 &lt;script&gt;");
    expect(html).not.toContain("<script>全店");
    expect(visible).not.toContain(productQuestion);
    expect(visibleHtml(renderToStaticMarkup(await ProductsPage({})))).not.toContain(
      productQuestion,
    );
    expect(visibleHtml(renderToStaticMarkup(await ProductsPage({})))).not.toContain(storeQuestion);

    const blocks = jsonLdBlocks(html);
    const first = blocks[0];
    expect(isRecord(first) && Array.isArray(first["@graph"])).toBe(true);
    expect(JSON.stringify(blocks[0])).not.toContain("FAQPage");
    expect(blocks[1]).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ name: storeQuestion, acceptedAnswer: { text: storeAnswer } }],
    });

    const markdown = await (await landingMarkdownResponse()).text();
    expect(markdown.indexOf("## 已上架商品")).toBeLessThan(markdown.indexOf(`## ${faqHeading}`));
    expect(markdown).toContain(`### ${storeQuestion}`);
    expect(markdown).toContain("全店答案 <script>");
    const listMarkdown = await (
      await listMarkdownResponse(new Request("https://merclink.example/products.md"))
    ).text();
    expect(listMarkdown).not.toContain(faqHeading);
    expect(listMarkdown).not.toContain(productQuestion);

    registerStore(publishedStore(), []);
    const empty = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(empty).not.toContain(faqHeading);
    expect(empty).not.toContain("默认问题");
    expect(jsonLdBlocks(renderToStaticMarkup(await HomePage()))).toHaveLength(1);
  });

  it("renders product faqs after the detail and keeps unpublished urls free of faq text", async () => {
    const product = sampleProduct("prd_detail", [
      { question: productQuestion, answer: productAnswer },
    ]);
    registerProducts([product]);
    registerStore(publishedStore(), [{ question: storeQuestion, answer: storeAnswer }]);
    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const visible = visibleHtml(html);
    const articleEnd = visible.indexOf("</article>");
    expect(visible.indexOf(productFactsHeading)).toBeLessThan(visible.indexOf("查看用户 Skill"));
    expect(visible.indexOf("查看用户 Skill")).toBeLessThan(articleEnd);
    expect(articleEnd).toBeLessThan(visible.indexOf(productQuestion));
    expect(visible).toContain(`<h2>${faqHeading}</h2>`);
    expect(visible).toContain('class="faq"');
    expect(visible).not.toContain(storeQuestion);
    expect(jsonLdBlocks(html)[0]).toMatchObject({ "@type": "Product" });
    expect(jsonLdBlocks(html)[1]).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ name: productQuestion, acceptedAnswer: { text: productAnswer } }],
    });
    const markdown = await (await productMarkdownResponse(product.id)).text();
    expect(markdown.indexOf("## 可售规格")).toBeLessThan(markdown.indexOf(`## ${faqHeading}`));
    expect(markdown).toContain(productAnswer);

    publicProducts.register({
      list: () => Promise.resolve({ items: [], nextCursor: null }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_hidden" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expect(ProductPage({ params: Promise.resolve({ id: "prd_hidden" }) })).rejects.toThrow();
    const hidden = renderToStaticMarkup(await ProductNotFound());
    expect(hidden).not.toContain(productQuestion);
    expect(hidden).not.toContain(storeQuestion);
    expect(hidden).toContain("没有找到商品");
  });

  it("shows only faqs when the profile is withdrawn and does not publish faq text in llms or the sitemap", async () => {
    registerStore(null, [{ question: storeQuestion, answer: storeAnswer }]);
    registerProducts([]);
    const html = renderToStaticMarkup(await HomePage());
    expect(visibleHtml(html)).toContain(`<h2>${faqHeading}</h2>`);
    expect(visibleHtml(html)).toContain(storeQuestion);
    expect(JSON.stringify(jsonLdBlocks(html)[0])).not.toContain("OnlineStore");
    expect(jsonLdBlocks(html)[1]).toMatchObject({ "@type": "FAQPage" });
    const metadata = await homeMetadata();
    expect(metadata.description).toBe(storeExplanation);
    expect(metadata.description).not.toContain(storeAnswer);
    const directory = (await import("./site")).llmsText();
    expect(directory).not.toContain(storeQuestion);
    expect(directory).not.toContain(storeAnswer);
    expect(publicPagePaths).not.toContain("/faq");
  });

  it("declares faq regions on the builtin starter and keeps them valid", () => {
    const fragments = renderStarterFragments();
    expect(fragments["index.html"]).toContain('data-merclink="store.faq"');
    expect(fragments["index.html"]).toContain('name="faq.question"');
    expect(fragments["index.html"]).toContain('name="faq.answer"');
    expect(fragments["products/item.html"]).toContain('data-merclink="product.faq"');
    expect(fragments["products/index.html"]).not.toContain("faq.question");
    expect(fragments["index.html"]).not.toContain(faqHeading);
    expect(fragments["products/item.html"]).not.toContain(faqHeading);
    expect(inspectDocument("index.html", fragments["index.html"]).ok).toBe(true);
    expect(inspectDocument("products/item.html", fragments["products/item.html"]).ok).toBe(true);

    const filled = renderDocument(
      fragments["index.html"],
      faqContext([{ question: "区域问题", answer: "区域答案" }]),
    );
    expect(filled.match(/<h2>常见问题<\/h2>/g)).toEqual(["<h2>常见问题</h2>"]);
    expect(filled.indexOf("<h2>常见问题</h2>")).toBeLessThan(filled.indexOf("区域问题"));
    const emptied = renderDocument(fragments["index.html"], faqContext([]));
    expect(emptied).not.toContain(faqHeading);
    expect(emptied).not.toContain("区域问题");

    const answer = "查看 /products/{id}";
    const product = renderDocument(fragments["products/item.html"], {
      ...faqContext([]),
      product: {
        id: "prd_real",
        catalogId: "cat_real",
        name: "吊坠",
        cover: null,
        fields: {},
        variants: [],
        stock: null,
        availability: "in_stock",
        priceMinor: 100,
        currency: "CNY",
        faqs: [{ question: "在哪看", answer }],
      },
    });
    expect(product).toContain(answer);
    expect(product).not.toContain("查看 /products/prd_real");
    expect(product.match(/<h2>常见问题<\/h2>/g)).toEqual(["<h2>常见问题</h2>"]);
    const quietProduct = renderDocument(fragments["products/item.html"], {
      ...faqContext([{ question: "全店问题", answer: "全店答案" }]),
      product: {
        id: "prd_real",
        name: "吊坠",
        cover: null,
        fields: {},
        variants: [],
        stock: null,
        availability: "in_stock",
        priceMinor: 100,
        faqs: [],
      },
    });
    expect(quietProduct).not.toContain(faqHeading);
    expect(quietProduct).not.toContain("全店问题");
  });
});

function faqContext(storeFaqs: { question: string; answer: string }[]): SlotContext {
  return {
    store: null,
    products: [],
    product: null,
    orderStatus: null,
    nextCursor: null,
    storeFaqs,
  };
}

function registerStore(
  store: PublicStoreProfile | null,
  faqs: readonly { question: string; answer: string }[],
): void {
  publicStore.register({
    get: () => Promise.resolve(store),
    faqs: () => Promise.resolve(faqs),
  });
}

function registerProducts(items: readonly PublicProduct[]): void {
  publicProducts.register({
    list: () => Promise.resolve({ items, nextCursor: null }),
    get: (id) => {
      const product = items.find((item) => item.id === id);
      return Promise.resolve(
        product === undefined
          ? { ok: false, error: "not_found", message: "没有找到。" }
          : { ok: true, product },
      );
    },
  });
}

function publishedStore(): PublicStoreProfile {
  return {
    displayName: "南风商店",
    summary: "已发布简介",
    websiteUrl: null,
    logoUrl: null,
    areaServed: null,
    address: null,
    license: null,
    contact: { phone: "010-00000000", label: "白天", qrUrl: null },
  };
}

function sampleProduct(
  id: string,
  faqs: readonly { question: string; answer: string }[],
): PublicProduct {
  return {
    id,
    catalogId: "cat_a",
    title: "示例商品",
    description: "示例描述",
    cover: null,
    currency: "CNY",
    offer: { price: minorUnits(100), currency: "CNY", availability: "in_stock" },
    fields: { origin: "示例" },
    fieldLabels: { origin: "产地" },
    variants: [
      {
        id: "var_a",
        price: minorUnits(100),
        currency: "CNY",
        stock: 1,
        availability: "in_stock",
        optionValues: {},
        sku: null,
      },
    ],
    faqs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Cut script blocks out by tag position. A stripping regexp is flagged as an HTML sanitizer.
function visibleHtml(html: string): string {
  const parts: string[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf("<script", cursor);
    if (start < 0) {
      parts.push(html.slice(cursor));
      break;
    }
    parts.push(html.slice(cursor, start));
    const endTag = lower.indexOf("</script", start + "<script".length);
    const close = endTag < 0 ? -1 : html.indexOf(">", endTag);
    if (close < 0) {
      parts.push(html.slice(start));
      break;
    }
    cursor = close + 1;
  }
  return parts.join("");
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1] ?? "null") as unknown,
  );
}
