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
import { resetPurchaseModeCache } from "../shared/purchase-mode";
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
        `${origin}/interfaces`,
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
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body.startsWith("# MercLink\n")).toBe(true);
    expect(body).toContain("\n> ");
    expect(body).toContain("\n## ");
    expect(body).toContain("/index.md");
    expect(body).toContain("/products.md");
    expect(body).not.toContain("llms-full.txt");
    expect(body).toBe(llmsText());
    expect(body.indexOf("## 先读")).toBeLessThan(body.indexOf("## 页面"));
    expect(body.indexOf("## 页面")).toBeLessThan(body.indexOf("## 接口"));
    expect(body).toContain(`${origin}/`);
    expect(body).toContain(`${origin}/index.md`);
    expect(body).toContain(`${origin}/products`);
    expect(body).toContain(`${origin}/products.md`);
    expect(body).toContain(`${origin}/skill.md`);
    expect(body).toContain(`${origin}/merchant/skill.md`);
    expect(body).toContain(`${origin}/storefront/skill.md`);
    expect(body).toContain(`${origin}/interfaces`);
    expect(body).toContain("接口文档");
    expect(body).toContain("不是文档");
    expect(body).toContain("不是调用说明");
    expect(body).toContain(`${origin}/api/v1/store`);
    expect(body).toContain(`${origin}/api/v1`);
    expect(body).not.toContain("/api/v1/catalogs");
    expect(body).toContain("商家自行填写，本系统未核验。");
    expect(body).toContain("这里没有规格 ID，不能靠它下单。");
    expect(body).not.toContain(hiddenTitle);
    expect(body).not.toContain("prd_llms");
  });

  it("describes the user skill without an order when purchase is disabled and with one line when enabled", async () => {
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
    const disabled = await (await llms()).text();
    expect(disabled).toContain("用户 Skill");
    expect(disabled).not.toContain("买家 Skill");
    expect(disabled).not.toContain("下一笔只有一行的订单");
    expect(disabled).toContain("用于查找已上架商品");
    expect(skillLine(disabled)).not.toContain("下单");
    expect(skillLine(disabled)).not.toContain("打开支付");
    expect(storefrontLine(disabled)).not.toContain("购买");
    expect(storefrontLine(disabled)).not.toContain("下单");
    expect(disabled).not.toContain("完成购买");

    process.env.MERCLINK_PURCHASE = "1";
    resetPurchaseModeCache();
    const enabled = await (await llms()).text();
    expect(enabled).toContain("用户 Skill");
    expect(enabled).toContain("下一笔只有一行的订单");
    expect(enabled).toContain("随后查询该订单");
    expect(enabled).not.toContain("买家 Skill");
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
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
          license: {
            name: "示例企业",
            creditCode: "91310000MA1FL0000N",
            legalPerson: "例某",
            registeredAddress: "示例市注册路 1 号",
            imageUrl: "https://cdn.example/license.png",
          },
          contact: { phone: "010-00000000", label: "客服", qrUrl: null },
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
    expect(body).not.toContain("杭州市");
    expect(body).not.toContain("https://shop.example");
    expect(body).not.toContain("/merchants");
    expect(body).not.toContain("91310000MA1FL0000N");
    expect(body).not.toContain("例某");
    expect(body).not.toContain("010-00000000");
    expect(body).not.toContain("示例市注册路 1 号");
    expect(body).not.toContain("https://cdn.example/license.png");
    expect(body).toContain("商家自行填写，本系统未核验。");
    const withoutHeading = body.replace(/^# .+\n\n> .+\n\n/, "");
    expect(withoutHeading).not.toContain("南风商店");
    expect(withoutHeading).not.toContain("一句已发布简介");
  });

  it("does not keep a withdrawn store name in llms.txt and omits markdown from the sitemap", async () => {
    publicStore.register({
      get: () =>
        Promise.resolve({
          displayName: "撤下的店",
          summary: "不该留下的简介",
          websiteUrl: null,
          logoUrl: null,
          areaServed: null,
          address: "不该留下的地址",
          license: null,
          contact: null,
        }),
    });
    resetPublicStore();
    const body = await (await llms()).text();
    expect(body).not.toContain("撤下的店");
    expect(body).not.toContain("不该留下的简介");
    expect(body).not.toContain("不该留下的地址");

    publicProducts.register({
      list: () =>
        Promise.resolve({ items: [product("prd_map", "地图商品")], nextCursor: "page-2" }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const entries = await sitemap();
    expect(
      entries.some((entry) =>
        /\/index\.md$|\/products\.md$|\/products\/[^/]+\.md$/.test(entry.url),
      ),
    ).toBe(false);
    expect(entries.some((entry) => entry.url.includes("cursor"))).toBe(false);
    expect(entries.some((entry) => "lastmod" in entry)).toBe(false);
    expect(entries.map((entry) => entry.url)).toContain(`${origin}/products/prd_map`);
    expect(entries.map((entry) => entry.url)).not.toContain(`${origin}/products/prd_map.md`);
  });
});

function skillLine(directory: string): string {
  return directory.split("\n").find((line) => line.includes("用户 Skill（/skill.md）")) ?? "";
}

function storefrontLine(directory: string): string {
  return (
    directory.split("\n").find((line) => line.includes("店面 Skill（/storefront/skill.md）")) ?? ""
  );
}

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
