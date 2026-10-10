import { absoluteUrl, publicBaseUrl } from "./site";

const markdownSuffix = ".md";

export function isPublicProductId(id: string): boolean {
  return id.length > 0 && !id.includes(".") && !id.includes("/") && !id.includes("\\");
}

function acceptsMarkdown(accept: string | null): boolean {
  if (accept === null || accept.trim().length === 0) {
    return false;
  }
  let markdownQ = 0;
  let htmlQ = 0;
  let sawMarkdown = false;
  for (const part of accept.split(",")) {
    const [rawType, ...params] = part.trim().split(";");
    const type = rawType?.trim().toLowerCase() ?? "";
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key?.trim() === "q" && value !== undefined) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          q = parsed;
        }
      }
    }
    if (type === "text/markdown") {
      sawMarkdown = true;
      markdownQ = q;
    }
    if (type === "text/html") {
      htmlQ = q;
    }
  }
  return sawMarkdown && markdownQ > 0 && markdownQ > htmlQ;
}

export function isServerMarkdownPath(pathname: string): boolean {
  const path = pathOnly(pathname);
  return (
    path === "/index.md" ||
    path === "/products.md" ||
    /^\/products\/[^/]+\.md$/.test(path) ||
    path === "/markdown" ||
    path.startsWith("/markdown/")
  );
}

// Recognize the Markdown suffix before any public product query. `/products.md` is the list, not an id.
export function markdownRewritePath(pathname: string, accept: string | null): string | null {
  const path = pathOnly(pathname);
  if (path === "/index.md") {
    return "/markdown/landing";
  }
  if (path === "/products.md") {
    return "/markdown/list";
  }
  const suffixed = /^\/products\/([^/]+)\.md$/.exec(path);
  if (suffixed !== null) {
    return productMarkdownPath(suffixed[1] ?? "");
  }
  if (!acceptsMarkdown(accept)) {
    return null;
  }
  if (path === "/") {
    return "/markdown/landing";
  }
  if (path === "/products") {
    return "/markdown/list";
  }
  const product = /^\/products\/([^/]+)$/.exec(path);
  if (product !== null) {
    return productMarkdownPath(product[1] ?? "");
  }
  return null;
}

export function htmlDiscoveryLinks(pathname: string, search: string): string | null {
  const path = pathOnly(pathname);
  if (path === "/") {
    return joinLinks([alternateMarkdown("/index.md"), describedByLlms()]);
  }
  if (path === "/products") {
    const cursor = cursorFromSearch(search);
    const markdown =
      cursor === null ? "/products.md" : `/products.md?cursor=${encodeURIComponent(cursor)}`;
    const parts = [alternateMarkdown(markdown), describedByLlms()];
    if (cursor !== null) {
      parts.unshift(canonicalLink(`/products?cursor=${encodeURIComponent(cursor)}`));
      parts.push(relationLink("prev", "/products"));
    }
    return joinLinks(parts);
  }
  const match = /^\/products\/([^/]+)$/.exec(path);
  const id = match?.[1];
  if (id !== undefined && isPublicProductId(id)) {
    return joinLinks([
      canonicalLink(`/products/${id}`),
      alternateMarkdown(`/products/${id}${markdownSuffix}`),
      describedByLlms(),
    ]);
  }
  return null;
}

export function canonicalLink(path: string, origin = publicBaseUrl()): string {
  return `<${absoluteUrl(path, origin)}>; rel="canonical"`;
}

export function alternateMarkdown(path: string, origin = publicBaseUrl()): string {
  return `<${absoluteUrl(path, origin)}>; rel="alternate"; type="text/markdown"`;
}

export function describedByLlms(origin = publicBaseUrl()): string {
  return `<${absoluteUrl("/llms.txt", origin)}>; rel="describedby"`;
}

export function relationLink(rel: "next" | "prev", path: string, origin = publicBaseUrl()): string {
  return `<${absoluteUrl(path, origin)}>; rel="${rel}"`;
}

export function joinLinks(parts: readonly string[]): string {
  return parts.join(", ");
}

function productMarkdownPath(id: string): string {
  if (!isPublicProductId(id)) {
    return "/markdown/hidden";
  }
  return `/markdown/products/${id}`;
}

function pathOnly(pathname: string): string {
  const path = pathname.split("?")[0] ?? "/";
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

function cursorFromSearch(search: string): string | null {
  const cursor = new URLSearchParams(search).get("cursor");
  if (cursor === null || cursor.length === 0) {
    return null;
  }
  return cursor;
}
