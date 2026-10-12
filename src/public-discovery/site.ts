import { apiRoutes, type ApiAudience } from "../shared/api-routes";

const localOrigin = "http://localhost:3000";

export const storeSlogan = "在 AI 时代，让天下没有难做的生意";

export const storeExplanation = "帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。";

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
  { audience: "buyer", title: "买家 Skill", href: buyerSkillPath },
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
export function llmsText(origin = publicBaseUrl(), store: StoreQuote | null = null): string {
  const title = store === null ? siteName : oneLine(store.displayName);
  const summary = store === null ? storeExplanation : oneLine(store.summary);
  const lines = [
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    "## 页面",
    "",
    `- [总落地页](${absoluteUrl("/", origin)}): 这一家店和已上架商品`,
    `- [落地页 Markdown](${absoluteUrl("/index.md", origin)}): 与总落地页相同的公开事实`,
    `- [商品列表](${absoluteUrl("/products", origin)}): 当前已上架商品`,
    `- [商品列表 Markdown](${absoluteUrl("/products.md", origin)}): 与商品列表相同的公开事实`,
    "",
    "## 接口",
    "",
    `- [买家 Skill](${absoluteUrl(buyerSkillPath, origin)}): 如何查询商品、下单并查询自己的订单`,
    `- [商家 Skill](${absoluteUrl(merchantSkillPath, origin)}): 如何管理目录、字段、商品和规格`,
    `- [店面 Skill](${absoluteUrl(storefrontSkillPath, origin)}): 如何改页面，以及哪些事实和协议不能改`,
    `- [API](${absoluteUrl(apiRootPath, origin)}): HTTP API 根地址`,
    "",
  ];
  return lines.join("\n");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
