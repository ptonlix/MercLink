import { apiRoutes, type ApiAudience } from "../shared/api-routes";
import { currentPurchaseEnabled } from "../shared/purchase-mode";

const localOrigin = "http://localhost:3000";

export const storeSlogan = "在 AI 时代，让天下没有难做的生意";

export const storeExplanation = "帮中小商家做自己的店，并让各种 Agent 直接找到商品。";
const purchaseStoreExplanation = "帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。";

export function explanationFor(purchaseEnabled: boolean): string {
  return purchaseEnabled ? purchaseStoreExplanation : storeExplanation;
}

export const emptyProductsNote = "没有可展示的商品。";

export const unverifiedProfileNotice = "商家自行填写，本系统未核验。";

export const viewAllProductsLabel = "查看更多";

export const siteName = "MercLink";

export const buyerSkillPath = "/skill.md";

export const merchantSkillPath = "/merchant/skill.md";

export const storefrontSkillPath = "/storefront/skill.md";

const apiRootPath = "/api/v1";

export const interfaceDirectoryPath = "/interfaces";

export const interfaceDirectoryLabel = "接口文档";

export const publicPagePaths = [
  "/",
  "/products",
  buyerSkillPath,
  merchantSkillPath,
  storefrontSkillPath,
  interfaceDirectoryPath,
] as const;

export const disallowedPaths = ["/authorize", "/admin", "/oauth", "/api", "/dev"] as const;

export function publicBaseUrl(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = source.APP_BASE_URL?.trim() ?? "";
  const candidate = raw.length > 0 ? raw : localOrigin;
  try {
    const url = new URL(candidate);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.origin}${path}`;
  } catch {
    return localOrigin;
  }
}

export function absoluteUrl(path: string, origin = publicBaseUrl()): string {
  return `${origin}${path}`;
}

export type RobotsPolicy = {
  rules: {
    userAgent: string;
    allow: string[];
    disallow: string[];
  };
  sitemap: string;
};

export function publicRobots(origin = publicBaseUrl()): RobotsPolicy {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/index.md",
        "/products",
        "/products.md",
        buyerSkillPath,
        merchantSkillPath,
        storefrontSkillPath,
        interfaceDirectoryPath,
      ],
      disallow: [...disallowedPaths, "/markdown"],
    },
    sitemap: absoluteUrl("/sitemap.xml", origin),
  };
}

export type SitemapEntry = {
  url: string;
};

export function staticSitemapEntries(origin = publicBaseUrl()): SitemapEntry[] {
  return publicPagePaths.map((path) => ({ url: absoluteUrl(path, origin) }));
}

export function productSitemapEntry(id: string, origin = publicBaseUrl()): SitemapEntry {
  return { url: absoluteUrl(`/products/${id}`, origin) };
}

type InterfaceDirectoryRoute = {
  method: string;
  path: string;
};

export type InterfaceDirectoryGroup = {
  title: string;
  href: string | null;
  routes: readonly InterfaceDirectoryRoute[];
};

const directorySkills = [
  { audience: "buyer", title: "用户 Skill", href: buyerSkillPath },
  { audience: "merchant", title: "商家 Skill", href: merchantSkillPath },
  { audience: "storefront", title: "店面 Skill", href: storefrontSkillPath },
] as const satisfies readonly {
  audience: ApiAudience;
  title: string;
  href: string;
}[];

// audiences 表示哪份 Skill 必须写到这条路径，不是登录要求。
export function interfaceDirectoryGroups(): readonly InterfaceDirectoryGroup[] {
  const skillGroups = directorySkills.map((skill) => ({
    title: skill.title,
    href: skill.href,
    routes: apiRoutes
      .filter((route) => {
        const audiences: readonly string[] = route.audiences;
        return audiences.includes(skill.audience);
      })
      .map((route) => ({ method: route.method, path: route.path })),
  }));
  return [
    ...skillGroups,
    {
      title: "独立调用",
      href: null,
      routes: apiRoutes
        .filter((route) => route.audiences.length === 0)
        .map((route) => ({ method: route.method, path: route.path })),
    },
  ];
}

export type StoreQuote = {
  displayName: string;
  summary: string;
};

// llms.txt is a directory. A published name and summary may appear only in the H1 and blockquote.
// Link descriptions may cite field names and the fixed unverified notice. They must not embed values.
export function llmsText(
  origin = publicBaseUrl(),
  store: StoreQuote | null = null,
  purchaseEnabled = currentPurchaseEnabled(),
): string {
  const title = store === null ? siteName : oneLine(store.displayName);
  const summary = store === null ? explanationFor(purchaseEnabled) : oneLine(store.summary);
  const userSkill = purchaseEnabled
    ? "用户 Agent 的调用说明，不是这家店的商品数据，也不是第二份说明。用它查已上架商品、读目录字段，并可下一笔只有一行的订单，随后查询该订单。未登录可以查商品。不要向用户要密码、短信验证码或 API Key。不要自己传价格。"
    : "用户 Agent 的调用说明，用于查找已上架商品。";
  const storefrontSkill = purchaseEnabled
    ? "商品、价格、店铺介绍仍走商家 Skill。购买仍走同一份用户 Skill。"
    : "商品、价格、店铺介绍仍走商家 Skill。查找已上架商品走用户 Skill。";
  const apiSkill = purchaseEnabled
    ? "商品查询公开。下单和改资料要设备码换来的令牌。"
    : "商品查询公开。改资料要设备码换来的令牌。本部署未开启买入。";
  const lines = [
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    "## 先读",
    "",
    `- [落地页 Markdown（/index.md）](${absoluteUrl("/index.md", origin)}): 这家店的已发布事实，和总落地页相同。包括展示名、简介、区域、经营地址、网站和标识。客服电话、客服说明、客服二维码、企业名称、统一社会信用代码、法人、注册地址和执照图只在商家已发布时出现，并带「${unverifiedProfileNotice}」两组都没有时不写空段。这里没有规格 ID，不能靠它下单。`,
    `- [商品列表 Markdown（/products.md）](${absoluteUrl("/products.md", origin)}): 当前已上架商品的摘要，和 /products 相同。每行是名称、主币价格、有货或没货、商品 ID。没有店铺介绍，没有规格 ID。单件的公开字段、封面、整数分和规格 ID 在 /products/{id}.md。超过一页时正文给出下一页 cursor。`,
    `- [用户 Skill（/skill.md）](${absoluteUrl(buyerSkillPath, origin)}): ${userSkill}`,
    "",
    "## 页面",
    "",
    `- [总落地页（/）](${absoluteUrl("/", origin)}): 给人看的同一份店和商品事实。Agent 读落地页 Markdown 即可，不要两份都读。店面激活后这页可能换成商家 HTML；落地页 Markdown 仍由服务端生成。`,
    `- [商品列表（/products）](${absoluteUrl("/products", origin)}): 给人看的商品列表。Agent 读商品列表 Markdown。单个商品页是 /products/{id}，Markdown 是 /products/{id}.md。下架、删除或没有可售规格的商品不在这里。`,
    "",
    "## 接口",
    "",
    `- [店铺 JSON（/api/v1/store）](${absoluteUrl("/api/v1/store", origin)}): 已发布介绍的机器读取，不需要令牌。字段始终都在；没有的网站、标识、license、contact 是 null，不是省略。未发布时 404，不回显草稿。不要从 Markdown 猜测缺了哪一项。`,
    `- [商家 Skill（/merchant/skill.md）](${absoluteUrl(merchantSkillPath, origin)}): 商家 Agent 的调用说明，不含这家店的资料或令牌。用它管理目录、目录字段、商品、规格、上下架，以及整店一份的介绍。介绍不是每本目录一份。客服和执照是推荐录入，不是上架条件；写入执照前必须先向用户读出四项并得到同意。不要用它给买家下单。`,
    `- [店面 Skill（/storefront/skill.md）](${absoluteUrl(storefrontSkillPath, origin)}): 只讲怎么改给人看的页面。${storefrontSkill}不能改 /llms.txt、三份 Skill、/api、授权页协议和支付结果判断。页面上的客服和执照必须用槽位，不能写死。`,
    `- [接口文档（/interfaces）](${absoluteUrl(interfaceDirectoryPath, origin)}): 给人看的已登记路径、字段、认证和权限。不是调用说明，也不能代替三份 Skill。不要从这里猜未登记的路径。`,
    `- [API（/api/v1）](${absoluteUrl(apiRootPath, origin)}): HTTP API 根地址，不是文档。已登记路径见接口文档。具体怎么调用仍以三份 Skill 为准，不要猜。${apiSkill}robots.txt 禁止 /api 只约束爬虫，不禁止已批准的 Agent。`,
    "",
  ];
  return lines.join("\n");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
