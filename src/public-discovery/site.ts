const localOrigin = "http://localhost:3000";

export const serviceDescription = "MercLink 让 Agent 查询已上架商品并下单。";

export const merchantRegistrationNote = "商家不能自助注册，需要管理员开通。";

export const emptyProductsNote = "没有可展示的商品。";

export const siteName = "MercLink";

export const buyerSkillPath = "/skill.md";

export const merchantSkillPath = "/merchant/skill.md";

export const apiRootPath = "/api/v1";

export const publicPagePaths = ["/", "/products", buyerSkillPath, merchantSkillPath] as const;

export const disallowedPaths = ["/authorize", "/admin", "/oauth", "/api"] as const;

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

// llms.txt only points at entry documents. It does not accept catalog rows.
export function llmsText(origin = publicBaseUrl()): string {
  const lines = [
    `# ${siteName}`,
    "",
    `> ${serviceDescription}`,
    "",
    `- [总落地页](${absoluteUrl("/", origin)}): 服务说明和已上架商品摘要`,
    `- [商品列表](${absoluteUrl("/products", origin)}): 当前已上架商品`,
    `- [购买 Skill](${absoluteUrl(buyerSkillPath, origin)}): 如何查询已上架商品并下单`,
    `- [商家 Skill](${absoluteUrl(merchantSkillPath, origin)}): 如何管理目录、字段、商品和规格`,
    `- [API](${absoluteUrl(apiRootPath, origin)}): HTTP API 根地址`,
    "",
  ];
  return lines.join("\n");
}
