import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderPreviewDocument } from "./render-slots.mjs";

const reservedPrefixes = ["/api", "/authorize", "/oauth", "/admin", "/media", "/.well-known"];
const reservedExact = new Set([
  "/skill.md",
  "/merchant/skill.md",
  "/storefront/skill.md",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
]);

export function shouldProxy(pathname) {
  if (reservedExact.has(pathname)) {
    return true;
  }
  return reservedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function configuredOrigin(origin) {
  let base;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return null;
  }
  if (base.username !== "" || base.password !== "") {
    return null;
  }
  return base;
}

// Request URL may name another host. Only its path and query may be reused, and only on the configured origin.
export function previewProxyTarget(requestUrl, origin) {
  const base = configuredOrigin(origin);
  if (base === null) {
    return null;
  }
  let incoming;
  try {
    incoming = new URL(requestUrl, base);
  } catch {
    return null;
  }
  if (blocked(incoming.pathname) || !shouldProxy(incoming.pathname)) {
    return null;
  }
  const target = new URL(`${incoming.pathname}${incoming.search}`, base);
  if (
    target.origin !== base.origin ||
    target.username !== "" ||
    target.password !== "" ||
    target.pathname !== incoming.pathname
  ) {
    return null;
  }
  return target;
}

export function normalizePreviewPath(pathname) {
  const raw = pathname.split("?")[0] ?? "/";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded.startsWith("/")) {
    decoded = `/${decoded}`;
  }
  if (decoded.length > 1 && decoded.endsWith("/")) {
    decoded = decoded.slice(0, -1);
  }
  return decoded;
}

function blocked(pathname) {
  return pathname.includes("..") || pathname.includes("\0") || pathname.includes("\\");
}

export function previewStaticCandidates(pathname) {
  const normalized = normalizePreviewPath(pathname);
  if (blocked(normalized)) {
    return [];
  }
  if (normalized === "/") {
    return ["index.html"];
  }
  if (normalized === "/products") {
    return ["products/index.html"];
  }
  if (normalized.startsWith("/products/")) {
    const id = /^\/products\/([^/]+)$/.exec(normalized)?.[1];
    if (id !== undefined && id.length > 0 && !id.includes(".")) {
      return ["products/item.html"];
    }
    return [];
  }
  const relative = normalized.slice(1);
  return [relative, `${relative}.html`, `${relative}/index.html`];
}

export async function resolvePreviewFile(root, pathname) {
  const base = path.resolve(root);
  for (const relative of previewStaticCandidates(pathname)) {
    const file = path.resolve(base, relative);
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
      continue;
    }
    try {
      const info = await stat(file);
      if (info.isFile()) {
        return file;
      }
    } catch {
      // The next candidate may be the file this directory was meant to hide.
    }
  }
  return null;
}

function sendFile(response, file) {
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500);
    response.end("read failed");
  });
  response.writeHead(200);
  stream.pipe(response);
}

function needsFacts(html) {
  return html.includes("<merclink-slot") || html.includes('data-merclink="');
}

function productId(pathname) {
  const id = /^\/products\/([^/]+)$/.exec(normalizePreviewPath(pathname))?.[1];
  if (id === undefined || id.length === 0 || id.includes(".")) {
    return null;
  }
  return id;
}

export function mapPreviewProduct(raw) {
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const stocks = variants
    .map((variant) => variant.stock)
    .filter((stock) => stock !== null && stock !== undefined);
  return {
    id: String(raw.id ?? ""),
    catalogId: typeof raw.catalog_id === "string" ? raw.catalog_id : "",
    name: String(raw.title ?? ""),
    cover: typeof raw.cover === "string" ? raw.cover : null,
    fields: raw.fields !== null && typeof raw.fields === "object" ? raw.fields : {},
    variants: variants.map((variant) => ({
      optionValues:
        variant.option_values !== null && typeof variant.option_values === "object"
          ? variant.option_values
          : {},
      stock: variant.stock ?? null,
      availability: String(variant.availability ?? ""),
      id: typeof variant.id === "string" ? variant.id : undefined,
      sku: typeof variant.sku === "string" ? variant.sku : null,
      currency: typeof variant.currency === "string" ? variant.currency : undefined,
      priceMinor: Number(variant.price ?? 0),
    })),
    stock: stocks.length === 0 ? null : Math.min(...stocks),
    availability: String(raw.offer?.availability ?? ""),
    priceMinor: Number(raw.offer?.price ?? 0),
    currency: typeof raw.offer?.currency === "string" ? raw.offer.currency : "CNY",
  };
}

export function mapPreviewStore(raw) {
  if (raw === null || typeof raw !== "object" || typeof raw.display_name !== "string") {
    return null;
  }
  return {
    displayName: raw.display_name,
    summary: String(raw.summary ?? ""),
    logo: typeof raw.logo_url === "string" ? raw.logo_url : null,
    website: typeof raw.website_url === "string" ? raw.website_url : null,
    area: typeof raw.area_served === "string" ? raw.area_served : null,
    address: typeof raw.address === "string" ? raw.address : null,
  };
}

async function readJson(url, headers) {
  const response = await fetch(url, headers === undefined ? undefined : { headers });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`preview facts ${response.status}`);
  }
  const body = await response.json();
  return body.data ?? null;
}

export async function loadPreviewFacts(origin, requestUrl, authorization) {
  const pathname = normalizePreviewPath(requestUrl.pathname);
  const id = productId(pathname);
  const storeData = await readJson(new URL("/api/v1/store", origin));
  let products = [];
  let product = null;
  let nextCursor = null;
  if (id !== null) {
    const one = await readJson(new URL(`/api/v1/products/${encodeURIComponent(id)}`, origin));
    if (one === null) {
      return { missingProduct: true, context: null };
    }
    product = mapPreviewProduct(one);
  } else if (pathname === "/" || pathname === "/products") {
    const listUrl = new URL("/api/v1/products", origin);
    listUrl.searchParams.set("limit", "20");
    const cursor = requestUrl.searchParams.get("cursor");
    if (cursor !== null && cursor.length > 0) {
      listUrl.searchParams.set("cursor", cursor);
    }
    const page = await readJson(listUrl);
    if (page === null) {
      throw new Error("preview facts missing product list");
    }
    products = Array.isArray(page.items) ? page.items.map(mapPreviewProduct) : [];
    nextCursor = typeof page?.next_cursor === "string" ? page.next_cursor : null;
  }
  let orderStatus = null;
  const orderId = requestUrl.searchParams.get("order_id");
  if (
    orderId !== null &&
    orderId.length > 0 &&
    authorization !== null &&
    authorization.length > 0
  ) {
    const order = await readJson(new URL(`/api/v1/orders/${encodeURIComponent(orderId)}`, origin), {
      authorization,
    });
    orderStatus = typeof order?.status === "string" ? order.status : null;
  }
  return {
    missingProduct: false,
    context: {
      store: mapPreviewStore(storeData),
      products,
      product,
      orderStatus,
      nextCursor,
      origin,
    },
  };
}

async function sendPreviewFile(response, file, requestUrl, origin, authorization) {
  if (!file.endsWith(".html")) {
    sendFile(response, file);
    return;
  }
  const html = await readFile(file, "utf8");
  if (!needsFacts(html)) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(html);
    return;
  }
  const facts = await loadPreviewFacts(origin, requestUrl, authorization);
  if (facts.missingProduct || facts.context === null) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(renderPreviewDocument(html, facts.context));
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const origin = process.env.STOREFRONT_ORIGIN ?? "http://127.0.0.1:3000";
  if (configuredOrigin(origin) === null) {
    process.stderr.write("STOREFRONT_ORIGIN must be an http(s) URL without credentials.\n");
    process.exit(1);
  }
  const root = path.resolve(process.argv[2] ?? "static");
  const port = Number(process.env.PORT ?? "4173");
  const server = createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url ?? "/", origin);
    } catch {
      response.writeHead(400);
      response.end("bad request");
      return;
    }
    const target = previewProxyTarget(request.url ?? "/", origin);
    if (target !== null) {
      // Host is pinned to STOREFRONT_ORIGIN; request.url only selects a reserved path.
      // codeql[js/request-forgery]
      fetch(target, { method: request.method, redirect: "manual" })
        .then(async (upstream) => {
          response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
          response.end(Buffer.from(await upstream.arrayBuffer()));
        })
        .catch(() => {
          if (!response.headersSent) {
            response.writeHead(502);
            response.end("proxy failed");
          }
        });
      return;
    }
    resolvePreviewFile(root, url.pathname)
      .then((file) => {
        if (file === null) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        sendPreviewFile(response, file, url, origin, request.headers.authorization ?? null).catch(
          () => {
            if (!response.headersSent) {
              response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
              response.end("preview facts unavailable");
            }
          },
        );
      })
      .catch(() => {
        if (!response.headersSent) {
          response.writeHead(500);
          response.end("read failed");
        }
      });
  });
  server.listen(port, "127.0.0.1");
}
