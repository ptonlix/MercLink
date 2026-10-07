import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { GET as buyerSkill } from "../app/agent-docs/buyer-skill/route";
import { GET as merchantSkill } from "../app/agent-docs/merchant-skill/route";
import { apiRoutes, routesFor } from "../shared/api-routes";
import { minorUnits } from "../shared/money";
import { publicProducts, resetPublicProducts } from "../shared/seams/public-products";

const buyerFile = "src/agent-docs/skill.md";
const merchantFile = "src/agent-docs/merchant-skill.md";
const apiPathPattern = /\/api\/v1(?:\/(?:[A-Za-z0-9_-]+|\{[A-Za-z0-9_]+\}))+/g;

describe("buyer skill", () => {
  it("is public and teaches query, registration, variants, minor units, and paid", async () => {
    const response = await buyerSkill();
    const body = await response.text();
    const file = await readFile(buyerFile, "utf8");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body).toBe(file);
    expect(missingAssignedPaths(body, routesFor("buyer"))).toEqual([]);
    expect(body).toContain("未登录");
    expect(body).toContain("已上架");
    expect(body).toContain("/authorize");
    expect(body).toContain("注册");
    expect(body).toContain("不要向用户索要密码、短信验证码或 API Key");
    expect(body).toContain("Do not ask the user for a password, SMS code, or API key.");
    expect(body).toContain("可售规格");
    expect(body).toContain("variant_id");
    expect(body).toContain("只有该商品恰好有一条可售规格");
    expect(body).toContain("商品 ID");
    expect(body).toContain("分");
    expect(body).toContain("client_order_no");
    expect(body).toContain("payment.action");
    expect(body).toContain("`paid`");
    expect(body).toContain("商品不存在");
    expect(body).toContain("已下架");
    expect(body).toContain("库存不足");
    expect(body).toContain("Key 无效");
    expect(body).toContain("invalid key");
    expect(body).toContain("字段不存在");
    expect(body).toContain("权限不足");
    expect(body).toContain("`not_found`");
    expect(body).toContain("`insufficient_stock`");
    expect(body).toContain("`unauthorized`");
    expect(body).toContain("`unknown_field`");
    expect(body).toContain("`forbidden`");
    expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9\-._]{12,}/);
    expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe("merchant skill", () => {
  it("teaches merchant paths, preview, and the three removal actions without private data", async () => {
    const sentinel = "merchant-private-catalog-sentinel";
    publicProducts.register({
      list: () =>
        Promise.resolve({
          items: [
            {
              id: "prd_private",
              catalogId: "cat_private",
              title: sentinel,
              cover: null,
              currency: "CNY",
              offer: {
                price: minorUnits(1),
                currency: "CNY",
                availability: "in_stock",
              },
              fields: {},
              variants: [],
            },
          ],
          nextCursor: null,
        }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    try {
      const response = await merchantSkill();
      const body = await response.text();
      const file = await readFile(merchantFile, "utf8");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      expect(body).toBe(file);
      expect(missingAssignedPaths(body, routesFor("merchant"))).toEqual([]);
      expect(body).toContain("不要引导用户自助注册");
      expect(body).toContain("Do not guide self-registration.");
      expect(body).toContain("不要向用户索要密码、短信验证码或 API Key");
      expect(body).toContain("字段预览");
      expect(body).toContain('"confirm": true');
      expect(body).toContain("下架");
      expect(body).toContain("软删除");
      expect(body).toContain("字段停用");
      expect(body).toContain("不是一回事");
      expect(body).toContain("unpublish");
      expect(body).toContain("soft delete");
      expect(body).toContain("field retirement");
      expect(body).toContain("不能把订单标成已支付");
      expect(body).toContain("也不能下单");
      expect(body).toContain("买家令牌不能调用商家写接口");
      expect(body).toContain("`paid`");
      expect(body).toContain("`forbidden`");
      expect(body).toContain("/api/v1/catalogs/{id}/images");
      expect(body).toContain("先上传图片");
      expect(body).not.toContain(sentinel);
      expect(body).not.toContain("prd_private");
      expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9\-._]{12,}/);
      expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    } finally {
      resetPublicProducts();
    }
  });
});

describe("skill paths match the route table", () => {
  it("fails when an assigned path is removed or an unlisted /api/v1 path is added", async () => {
    const buyer = await readFile(buyerFile, "utf8");
    const merchant = await readFile(merchantFile, "utf8");
    const listed = new Set(apiRoutes.map((route) => route.path));

    expect(missingAssignedPaths(buyer, routesFor("buyer"))).toEqual([]);
    expect(missingAssignedPaths(merchant, routesFor("merchant"))).toEqual([]);
    expect(unlistedApiPaths(buyer, listed)).toEqual([]);
    expect(unlistedApiPaths(merchant, listed)).toEqual([]);

    const omitted = "/api/v1/catalogs/{id}/schema";
    const buyerWithoutPath = buyer.split(omitted).join("REMOVED");
    expect(missingAssignedPaths(buyerWithoutPath, routesFor("buyer"))).toContain(omitted);

    const merchantOmitted = "/api/v1/manage/orders";
    const merchantWithoutPath = merchant.split(merchantOmitted).join("REMOVED");
    expect(missingAssignedPaths(merchantWithoutPath, routesFor("merchant"))).toContain(
      merchantOmitted,
    );

    expect(unlistedApiPaths(`${buyer}\nGET /api/v1/not-in-the-table\n`, listed)).toContain(
      "/api/v1/not-in-the-table",
    );
  });

  it("keeps the existing skill rewrites and does not define them here", async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual([
      { source: "/skill.md", destination: "/agent-docs/buyer-skill" },
      { source: "/merchant/skill.md", destination: "/agent-docs/merchant-skill" },
    ]);
  });
});

function mentionedApiPaths(markdown: string): string[] {
  return [...markdown.matchAll(apiPathPattern)].map((match) => match[0]);
}

function missingAssignedPaths(markdown: string, routes: readonly { path: string }[]): string[] {
  const mentioned = new Set(mentionedApiPaths(markdown));
  return [...new Set(routes.map((route) => route.path))].filter((path) => !mentioned.has(path));
}

function unlistedApiPaths(markdown: string, listed: ReadonlySet<string>): string[] {
  return [...new Set(mentionedApiPaths(markdown))].filter((path) => !listed.has(path));
}
