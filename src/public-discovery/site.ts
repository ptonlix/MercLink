const localOrigin = "http://localhost:3000";

export const storeSlogan = "在 AI 时代，让天下没有难做的生意";

export const storeExplanation = "帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。";

export const emptyProductsNote = "没有可展示的商品。";

export const viewAllProductsLabel = "查看更多";

export const siteName = "MercLink";

export const buyerSkillPath = "/skill.md";

export const merchantSkillPath = "/merchant/skill.md";

export const apiRootPath = "/api/v1";

export const publicPagePaths = ["/", "/products", buyerSkillPath, merchantSkillPath] as const;

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
      allow: ["/", "/products", buyerSkillPath, merchantSkillPath],
      disallow: [...disallowedPaths],
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

export type StoreQuote = {
  displayName: string;
  summary: string;
};

// llms.txt points at entry documents. It may quote the published store name and summary.
// It does not accept catalog rows or the rest of the profile.
export function llmsText(origin = publicBaseUrl(), store: StoreQuote | null = null): string {
  const lines = [`# ${siteName}`, "", `> ${storeExplanation}`, ""];
  if (store !== null) {
    lines.push(`店名：${store.displayName}`, `简介：${store.summary}`, "");
  }
  lines.push(
    `- [总落地页](${absoluteUrl("/", origin)}): 这一家店和已上架商品`,
    `- [商品列表](${absoluteUrl("/products", origin)}): 当前已上架商品`,
    `- [买家 Skill](${absoluteUrl(buyerSkillPath, origin)}): 如何查询商品、下单并查询自己的订单`,
    `- [商家 Skill](${absoluteUrl(merchantSkillPath, origin)}): 如何管理目录、字段、商品和规格`,
    `- [API](${absoluteUrl(apiRootPath, origin)}): HTTP API 根地址`,
    "",
  );
  return lines.join("\n");
}
