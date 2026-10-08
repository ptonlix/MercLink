import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { GET as buyerSkill } from "../app/agent-docs/buyer-skill/route";
import { GET as merchantSkill } from "../app/agent-docs/merchant-skill/route";
import { apiRoutes, routesFor } from "../shared/api-routes";
import { minorUnits } from "../shared/money";
import { publicProducts, resetPublicProducts } from "../shared/seams/public-products";
import { publicStore, resetPublicStore } from "../shared/seams/public-store";

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
    expect(body).toContain("/oauth/device/auth");
    expect(body).toContain("设备码");
    expect(body).toContain("不要使用公网回调地址");
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
    expect(body).toContain("payment_channel");
    expect(body).toContain("send `payment_channel` `mobile` on the first order request");
    expect(body).toContain("including an agent built-in page that can navigate");
    expect(body).toContain(
      "Open the complete `payment.action` URL with top-level navigation rather than an iframe or a truncated URL.",
    );
    expect(body).toContain("The default channel is the PC cashier.");
    expect(body).toContain("Repeating `client_order_no` does not switch channel.");
    expect(body).toContain("A new `client_order_no` must not be used only to switch channel.");
    expect(body).toContain("Do not ask for an Alipay password.");
    expect(body).toContain("顶层");
    expect(body).toContain("iframe");
    expect(body).toContain("不要向用户索要支付宝密码");
    expect(body).toContain("不会切换渠道");
    expect(body).toContain("电脑收银台");
    expect(body).toContain("`paid`");
    expect(body).toContain("商品不存在");
    expect(body).toContain("已下架");
    expect(body).toContain("库存不足");
    expect(body).toContain("Key 无效");
    expect(body).toContain("invalid key");
    expect(body).toContain("字段不存在");
    expect(body).toContain("权限不足");
    expect(body).toContain("`not_found`");
    expect(body).toContain("`insufficient_stock` `40901`");
    expect(body).toContain("不要根据 `message` 分支");
    expect(body).toContain("body 的 `code` 仍是 `200`");
    expect(body).toContain("纯文本");
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
      expect(body).toContain("client_id=merclink-agent");
      expect(body).toContain("application/x-www-form-urlencoded");
      expect(body).toContain("scope=field:write product:write product:read order:read");
      expect(body).toContain("verification_uri_complete");
      expect(body).toContain("POST /oauth/token");
      expect(body).toContain("authorization_pending");
      expect(body).toContain("请先修改初始密码");
      expect(body).toContain("店主账号");
      expect(body).not.toContain("请联系管理员开通");
      expect(body).toContain("默认目录");
      expect(body).toContain("data.items[].id");
      expect(body).toContain("data.applied");
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
      expect(body).toContain("`forbidden` `40300`");
      expect(body).toContain("从响应外壳读 `code` 和 `message`");
      expect(body).toContain("body 的 `code` 仍是 `200`");
      expect(body).toContain("/api/v1/catalogs/{id}/images");
      expect(body).toContain("/api/v1/catalogs/{id}/products/{product_id}/axes");
      expect(body).toContain("option_values");
      expect(body).toContain("choices");
      expect(body).toContain("fields");
      expect(body).not.toContain("/options");
      expect(body).not.toContain('"options"');
      expect(body).toContain("先上传图片");
      expect(body).toContain("不直接写对象存储");
      expect(body).toContain("dependency_unavailable` `50301` 时停止");
      expect(body).toContain("不要把外部地址、生成图地址或本地文件写进 `cover`");
      expect(body).toContain("匿名浏览器不带登录、签名或 Cookie 就能打开");
      expect(body).not.toContain("或外部 http(s) URL");
      expect(body).not.toContain(sentinel);
      expect(body).not.toContain("prd_private");
      expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9\-._]{12,}/);
      expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    } finally {
      resetPublicProducts();
    }
  });
});

describe("merchant profile skill", () => {
  it("documents profile read, replace, publish, and withdraw without stored data", async () => {
    const storedSummary = "stored-profile-summary-sentinel";
    publicStore.register({
      get: () =>
        Promise.resolve({
          displayName: "Stored Store",
          summary: storedSummary,
          websiteUrl: "https://stored.example/profile",
          logoUrl: null,
          areaServed: null,
          address: null,
        }),
    });
    try {
      const body = await (await merchantSkill()).text();
      expect(body).toContain("GET /api/v1/merchant/profile");
      expect(body).toContain("PUT /api/v1/merchant/profile");
      expect(body).toContain("GET /api/v1/store");
      for (const field of [
        "display_name",
        "summary",
        "website_url",
        "logo_url",
        "area_served",
        "address",
        "published",
      ]) {
        expect(body).toContain(field);
      }
      expect(body).toContain("只有 `published` 为 `true`");
      expect(body).toContain("改为 `false` 后，落地页立即不再显示");
      expect(body).toContain("不要把登录手机号、密码、短信验证码或 API Key 提交为公开资料");
      expect(body).not.toContain(storedSummary);
      expect(body).not.toContain("https://stored.example/profile");
      expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9\-._]{12,}/);
      expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    } finally {
      resetPublicStore();
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
