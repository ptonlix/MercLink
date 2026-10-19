import { describe, expect, it } from "vitest";
import { inspectDocument, renderDocument, type SlotContext } from "./slots";

const faqTemplate = `<template data-merclink="store.faq"><h3><merclink-slot name="faq.question"></merclink-slot></h3><p><merclink-slot name="faq.answer"></merclink-slot></p></template>`;

describe("faq slots", () => {
  it("expands a region, drops an empty region, and leaves an old template unchanged", () => {
    const context = slotContext([{ question: "区域问题", answer: "区域答案" }]);
    const rendered = renderDocument(`<main>${faqTemplate}</main>`, context);
    expect(rendered).toContain("区域问题");
    expect(rendered).toContain("区域答案");
    expect(rendered).not.toContain("data-merclink");
    expect(rendered.match(/<h2>常见问题<\/h2>/g)).toEqual(["<h2>常见问题</h2>"]);
    expect(rendered.indexOf("<h2>常见问题</h2>")).toBeLessThan(rendered.indexOf("区域问题"));

    const two = renderDocument(
      `<main>${faqTemplate}</main>`,
      slotContext([
        { question: "区域问题", answer: "区域答案" },
        { question: "第二条", answer: "第二个答案" },
      ]),
    );
    expect(two.match(/<h2>常见问题<\/h2>/g)).toEqual(["<h2>常见问题</h2>"]);
    expect(two.indexOf("<h2>常见问题</h2>")).toBeLessThan(two.indexOf("区域问题"));
    expect(two.indexOf("区域问题")).toBeLessThan(two.indexOf("第二条"));

    const empty = renderDocument(`<main>${faqTemplate}<h2>保留</h2></main>`, slotContext([]));
    expect(empty).toBe("<main><h2>保留</h2></main>");
    expect(empty).not.toContain("常见问题");
    const staticHeading = `<template data-merclink="store.faq"><h2>常见问题</h2><merclink-slot name="faq.question"></merclink-slot></template>`;
    expect(renderDocument(`<main>${staticHeading}</main>`, slotContext([]))).toBe("<main></main>");

    const oldHtml = "<main><p>旧店面</p></main>";
    expect(inspectDocument("index.html", oldHtml).ok).toBe(true);
    expect(renderDocument(oldHtml, context)).toBe(oldHtml);
    expect(renderDocument(oldHtml, context)).not.toContain("区域问题");
    expect(renderDocument(oldHtml, context)).not.toContain("常见问题");
  });

  it("rejects faq slots outside the region and other slots inside it", () => {
    expect(
      inspectDocument("index.html", `<p><merclink-slot name="faq.question"></merclink-slot></p>`),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      inspectDocument(
        "index.html",
        `<template data-merclink="product.faq"><merclink-slot name="product.name"></merclink-slot></template>`,
      ),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(inspectDocument("index.html", faqTemplate).ok).toBe(true);
    expect(
      inspectDocument("index.html", `${faqTemplate}<script type="application/ld+json">{}</script>`)
        .ok,
    ).toBe(false);
  });

  it("keeps literal product tokens inside a published answer", () => {
    const answer = "查看 /products/{id}";
    const items = [{ question: "在哪看", answer }];
    const productHtml =
      '<a href="/products/{id}">商品</a><template data-merclink="product.faq"><h3><merclink-slot name="faq.question"></merclink-slot></h3><p><merclink-slot name="faq.answer"></merclink-slot></p></template><template data-merclink="store.faq"><p><merclink-slot name="faq.question"></merclink-slot></p></template>';
    const productRendered = renderDocument(productHtml, {
      ...slotContext([{ question: "全店问题", answer: "全店答案" }]),
      product: {
        id: "prd_real",
        catalogId: "cat_real",
        name: "吊坠",
        cover: null,
        fields: {},
        variants: [],
        stock: 1,
        availability: "in_stock",
        priceMinor: 100,
        currency: "CNY",
        faqs: items,
      },
      storeFaqs: [],
    });
    expect(productRendered).toContain('href="/products/prd_real"');
    expect(productRendered).toContain(answer);
    expect(productRendered).not.toContain("查看 /products/prd_real");
    expect(productRendered).not.toContain("全店问题");
    expect(productRendered.match(/<h2>常见问题<\/h2>/g)).toEqual(["<h2>常见问题</h2>"]);
    expect(items[0]?.answer).toBe(answer);
  });
});

function slotContext(storeFaqs: { question: string; answer: string }[]): SlotContext {
  return {
    store: null,
    products: [],
    product: null,
    orderStatus: null,
    nextCursor: null,
    storeFaqs,
  };
}
