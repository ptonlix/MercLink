const reservedPrefixes = [
  "/api",
  "/authorize",
  "/oauth",
  "/admin",
  "/media",
  "/.well-known",
] as const;

const reservedExact = [
  "/skill.md",
  "/merchant/skill.md",
  "/storefront/skill.md",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
] as const;

const reservedExactSet = new Set<string>(reservedExact);

export const productListFile = "products/index.html";

export const productItemFile = "products/item.html";

export const fallbackFile = "index.html";

export function normalizePath(pathname: string): string {
  const raw = pathname.split("?")[0] ?? "/";
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = raw;
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}

export function isBlockedPath(pathname: string): boolean {
  return pathname.includes("..") || pathname.includes("\0") || pathname.includes("\\");
}

export function isReservedPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (isBlockedPath(path)) {
    return true;
  }
  if (reservedExactSet.has(path)) {
    return true;
  }
  return reservedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isProductPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/products" || path.startsWith("/products/");
}

export function productIdFromPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  const match = /^\/products\/([^/]+)$/.exec(path);
  const id = match?.[1];
  if (id === undefined || id.length === 0 || id.includes(".")) {
    return null;
  }
  return id;
}

// Active releases replace public GETs. Protocol routes stay on this process.
function releaseCanReplace(pathname: string): boolean {
  if (pathname === "/storefront-asset" || pathname.startsWith("/_next")) {
    return false;
  }
  return !isReservedPath(pathname);
}

export function storefrontRewritePath(pathname: string, active: boolean): string | null {
  if (!active || !releaseCanReplace(pathname)) {
    return null;
  }
  return "/storefront-asset";
}

export function staticCandidates(pathname: string): readonly string[] {
  const path = normalizePath(pathname).slice(1);
  if (path.length === 0) {
    return [fallbackFile];
  }
  return [path, `${path}.html`, `${path}/index.html`];
}
