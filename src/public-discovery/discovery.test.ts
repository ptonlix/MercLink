import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as llms } from "../app/llms.txt/route";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { minorUnits } from "../shared/money";
import {
  publicProducts,
  resetPublicProducts,
  type PublicProduct,
} from "../shared/seams/public-products";
import { publicStore, resetPublicStore } from "../shared/seams/public-store";
import { disallowedPaths, llmsText, publicPagePaths } from "./site";

const origin = "https://merclink.example";

describe("discovery files", () => {
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

  it("disallows authorization, admin, oauth, and api", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules[0] : policy.rules;
    expect(rules?.userAgent).toBe("*");
    expect(rules?.allow).toEqual(expect.arrayContaining(["/", "/products", ...publicPagePaths]));
    expect(rules?.disallow).toEqual(expect.arrayContaining([...disallowedPaths]));
    expect(rules?.disallow).toEqual(expect.arrayContaining(["/authorize", "/admin", "/api"]));
    expect(policy.sitemap).toBe(`${origin}/sitemap.xml`);
  });

  it("drops a product from the sitemap when the seam stops returning it", async () => {
    const first = product("prd_first", "第一双");
    first.cover = `${origin}/media/img_secret`;
    const second = product("prd_second", "第二双");
    publicProducts.register({
      list: (query) => {
        if (query.cursor === "page-2") {
          return Promise.resolve({ items: [second], nextCursor: null });
        }
        return Promise.resolve({ items: [first], nextCursor: "page-2" });
      },
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });

    const withProducts = (await sitemap()).map((entry) => entry.url);
    expect(withProducts).toEqual(
      expect.arrayContaining([
        `${origin}/`,
        `${origin}/products`,
        `${origin}/skill.md`,
        `${origin}/merchant/skill.md`,
        `${origin}/storefront/skill.md`,
        `${origin}/products/${first.id}`,
        `${origin}/products/${second.id}`,
      ]),
    );
    expect(withProducts.some((url) => url.includes("/authorize"))).toBe(false);
    expect(withProducts.some((url) => url.includes("/admin"))).toBe(false);
    expect(withProducts.some((url) => url.includes("/api"))).toBe(false);
    expect(withProducts.some((url) => url.includes("/agent-docs/"))).toBe(false);
    expect(withProducts.some((url) => url.includes("/media/"))).toBe(false);
    expect(withProducts).not.toContain(first.cover);
    expect(withProducts.some((url) => url.includes("/merchants"))).toBe(false);

    publicProducts.register({
      list: () => Promise.resolve({ items: [second], nextCursor: null }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const afterUnpublish = (await sitemap()).map((entry) => entry.url);
    expect(afterUnpublish.some((url) => url.includes(first.id))).toBe(false);
    expect(afterUnpublish).toContain(`${origin}/products/${second.id}`);
  });

  it("points llms.txt at the entry documents and does not embed the catalog", async () => {
    const hiddenTitle = "不该出现在llms的哨兵商品";
    publicProducts.register({
      list: () =>
        Promise.resolve({
          items: [product("prd_llms", hiddenTitle)],
          nextCursor: null,
        }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });

    const response = await llms();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toBe(llmsText());
    expect(body).toContain(`${origin}/`);
    expect(body).toContain(`${origin}/products`);
    expect(body).toContain(`${origin}/skill.md`);
    expect(body).toContain(`${origin}/merchant/skill.md`);
    expect(body).toContain(`${origin}/storefront/skill.md`);
    expect(body).toContain(`${origin}/api/v1`);
    expect(body).not.toContain(hiddenTitle);
    expect(body).not.toContain("prd_llms");
  });

  it("quotes the published store name and summary without embedding the catalog", async () => {
    const hiddenTitle = "不该出现在llms的哨兵商品";
    publicProducts.register({
      list: () =>
        Promise.resolve({
          items: [product("prd_llms", hiddenTitle)],
          nextCursor: null,
        }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    publicStore.register({
      get: () =>
        Promise.resolve({
          displayName: "南风商店",
          summary: "一句已发布简介",
          websiteUrl: "https://shop.example",
          logoUrl: "https://cdn.example/logo.png",
          areaServed: "杭州市",
          address: "西湖区某某路 88 号",
        }),
    });

    const body = await (await llms()).text();

    expect(body).toContain("南风商店");
    expect(body).toContain("一句已发布简介");
    expect(body).toContain(`${origin}/`);
    expect(body).toContain(`${origin}/products`);
    expect(body).toContain(`${origin}/skill.md`);
    expect(body).toContain(`${origin}/merchant/skill.md`);
    expect(body).toContain(`${origin}/storefront/skill.md`);
    expect(body).toContain(`${origin}/api/v1`);
    expect(body).not.toContain(hiddenTitle);
    expect(body).not.toContain("prd_llms");
    expect(body).not.toContain("https://cdn.example/logo.png");
    expect(body).not.toContain("西湖区某某路 88 号");
    expect(body).not.toContain("/merchants");
  });
});

function product(id: string, title: string): PublicProduct {
  return {
    id,
    catalogId: "cat_sentinel",
    title,
    cover: null,
    currency: "CNY",
    offer: {
      price: minorUnits(159900),
      currency: "CNY",
      availability: "out_of_stock",
    },
    fields: {},
    variants: [],
  };
}
