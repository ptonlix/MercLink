import { getDatabase } from "../../db/client";
import {
  fallbackFile,
  isProductPath,
  isReservedPath,
  productIdFromPath,
  productItemFile,
  productListFile,
  staticCandidates,
  storefrontRewritePath,
} from "../../domain/storefront/paths";
import {
  documentDeclaresProductSlots,
  documentDeclaresStoreSlots,
  documentHasSlots,
  renderDocument,
  stripMerchantJsonLd,
  type SlotContext,
  type SlotProduct,
  type SlotStore,
} from "../../domain/storefront/slots";
import { jsonLdElement, serverFactJsonLd } from "../../public-discovery/model";
import {
  alternateMarkdown,
  canonicalLink,
  describedByLlms,
  isServerMarkdownPath,
  joinLinks,
  relationLink,
} from "../../public-discovery/negotiate";
import { publicBaseUrl } from "../../public-discovery/site";
import type { PublicProduct } from "../../shared/seams/public-products";
import { publicProducts } from "../../shared/seams/public-products";
import { publicStore, type PublicStoreProfile } from "../../shared/seams/public-store";
import { storefrontRuntime } from "./runtime";
import type { FileRow } from "./store";

const hiddenBody = "没有找到。";

type ReleaseGate = "builtin" | "active" | "unavailable";

function databaseConfigured(): boolean {
  return process.env.DATABASE_URL !== undefined && process.env.DATABASE_URL.trim() !== "";
}

async function releaseGate(): Promise<ReleaseGate> {
  const runtime = storefrontRuntime();
  if (runtime !== undefined) {
    try {
      const pointer = await runtime.store.readPointer();
      return pointer.activeId === null ? "builtin" : "active";
    } catch {
      return "unavailable";
    }
  }
  if (!databaseConfigured()) {
    return "builtin";
  }
  try {
    const rows = await getDatabase().sql<{ active_release_id: string | null }[]>`
      SELECT active_release_id FROM storefront_pointer WHERE id = 'current'
    `;
    return rows[0]?.active_release_id == null ? "builtin" : "active";
  } catch {
    return "unavailable";
  }
}

export async function shouldRewriteToRelease(pathname: string): Promise<boolean> {
  if (isServerMarkdownPath(pathname) || storefrontRewritePath(pathname, true) === null) {
    return false;
  }
  return (await releaseGate()) !== "builtin";
}

export async function storefrontAuthorizeTarget(
  kind: "buyer" | "merchant",
): Promise<string | null> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return null;
  }
  const pointer = await runtime.store.readPointer();
  if (pointer.activeId === null) {
    return null;
  }
  const release = await runtime.store.getRelease(pointer.activeId);
  if (release === null) {
    return null;
  }
  const declared = kind === "buyer" ? release.authorizeBuyer : release.authorizeMerchant;
  if (declared === null) {
    return null;
  }
  const file = await runtime.store.findFile(pointer.activeId, declared);
  if (file === null) {
    return null;
  }
  return `/${declared}`;
}

export function authorizeLocation(
  target: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  return `${target}${suffix}`;
}

export async function serveStorefront(
  pathname: string,
  requestUrl: string,
  request: Request = new Request(requestUrl),
): Promise<Response | null> {
  if (
    isServerMarkdownPath(pathname) ||
    isReservedPath(pathname) ||
    storefrontRewritePath(pathname, true) === null
  ) {
    return null;
  }
  const gate = await releaseGate();
  if (gate === "builtin") {
    return null;
  }
  if (gate === "unavailable") {
    return textResponse(hiddenBody, 503, true);
  }
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return textResponse(hiddenBody, 503, true);
  }
  let pointer;
  try {
    pointer = await runtime.store.readPointer();
  } catch {
    return textResponse(hiddenBody, 503, true);
  }
  if (pointer.activeId === null) {
    return null;
  }
  const release = await runtime.store.getRelease(pointer.activeId);
  if (release === null) {
    return null;
  }
  if (isReservedPath(pathname)) {
    return null;
  }
  if (isProductPath(pathname)) {
    return serveProduct(pointer.activeId, pathname, request);
  }
  const file = await firstFile(pointer.activeId, staticCandidates(pathname));
  if (file !== null) {
    return serveFile(pointer.activeId, file, request, pathname, false);
  }
  if (release.fallback === fallbackFile) {
    const home = await runtime.store.findFile(pointer.activeId, fallbackFile);
    if (home !== null) {
      return serveFile(pointer.activeId, home, request, pathname, false);
    }
  }
  return textResponse(hiddenBody, 404, false);
}

export async function visibleSitemapEntries<T extends { url: string }>(
  entries: readonly T[],
): Promise<T[]> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return [...entries];
  }
  const pointer = await runtime.store.readPointer();
  if (pointer.activeId === null) {
    return [...entries];
  }
  const template = await runtime.store.findFile(pointer.activeId, productItemFile);
  const release = await runtime.store.getRelease(pointer.activeId);
  const fallback = release?.fallback === fallbackFile;
  return entries.filter((entry) => {
    const path = productPathname(entry.url);
    if (path === null) {
      return true;
    }
    if (fallback && template === null) {
      return false;
    }
    return template !== null;
  });
}

async function serveProduct(
  releaseId: string,
  pathname: string,
  request: Request,
): Promise<Response> {
  if (pathname === "/products" || pathname === "/products/") {
    const file = await firstFile(releaseId, [productListFile]);
    if (file === null) {
      return textResponse(hiddenBody, 404, true);
    }
    return serveFile(releaseId, file, request, pathname, true);
  }
  const id = productIdFromPath(pathname);
  if (id === null) {
    return textResponse(hiddenBody, 404, true);
  }
  const loaded = await publicProducts.get(id);
  if (!loaded.ok) {
    return textResponse(hiddenBody, 404, true);
  }
  const file = await firstFile(releaseId, [productItemFile]);
  if (file === null) {
    return textResponse(hiddenBody, 404, true);
  }
  return serveFile(releaseId, file, request, pathname, true, loaded.product);
}

async function serveFile(
  releaseId: string,
  file: FileRow,
  request: Request,
  pathname: string,
  forceRender: boolean,
  onlyProduct?: PublicProduct,
): Promise<Response> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return textResponse(hiddenBody, 503, true);
  }
  let object;
  try {
    object = await runtime.objectStorage.open(file.objectKey);
  } catch {
    return textResponse(hiddenBody, 503, true);
  }
  if (object === null) {
    return textResponse(hiddenBody, 503, true);
  }
  const html = file.path.endsWith(".html");
  if (!html) {
    return byteResponse(object.bytes, file.contentType);
  }
  const text = new TextDecoder().decode(object.bytes);
  const stripped = stripMerchantJsonLd(text);
  if (!forceRender && !documentHasSlots(stripped)) {
    const body = withDiscoveryTags(stripped, pathname, request, null);
    return htmlResponse(body, pathname, request, null, file.contentType);
  }
  const facts = await loadFacts(request, onlyProduct);
  const declaresStore = documentDeclaresStoreSlots(stripped);
  const declaresProduct = documentDeclaresProductSlots(stripped);
  let rendered = renderDocument(stripped, facts.context);
  const jsonLd = serverFactJsonLd({
    declaresStore,
    declaresProduct,
    store: facts.store,
    products: facts.products,
    product: facts.product,
  });
  if (jsonLd !== null) {
    rendered = injectJsonLd(rendered, jsonLdElement(jsonLd));
  }
  rendered = withDiscoveryTags(rendered, pathname, request, facts.context.nextCursor);
  return htmlResponse(rendered, pathname, request, facts.context.nextCursor, file.contentType);
}

type RenderFacts = {
  context: SlotContext;
  store: PublicStoreProfile | null;
  products: readonly PublicProduct[];
  product: PublicProduct | null;
};

async function loadFacts(request: Request, onlyProduct?: PublicProduct): Promise<RenderFacts> {
  const url = new URL(request.url);
  const [store, page] = await Promise.all([
    publicStore.get(),
    onlyProduct === undefined
      ? publicProducts.list({ limit: 20, cursor: url.searchParams.get("cursor") ?? undefined })
      : Promise.resolve({ items: [onlyProduct], nextCursor: null }),
  ]);
  const orderId = url.searchParams.get("order_id");
  const runtime = storefrontRuntime();
  const orderStatus =
    orderId === null || runtime === undefined
      ? null
      : await runtime.readOrderStatus({ request, orderId });
  return {
    context: {
      store: store === null ? null : storeFrom(store),
      products: onlyProduct === undefined ? page.items.map(slotProduct) : [],
      product: onlyProduct === undefined ? null : slotProduct(onlyProduct),
      orderStatus,
      nextCursor: page.nextCursor,
    },
    store,
    products: onlyProduct === undefined ? page.items : [],
    product: onlyProduct ?? null,
  };
}

async function firstFile(releaseId: string, paths: readonly string[]): Promise<FileRow | null> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return null;
  }
  for (const path of paths) {
    const file = await runtime.store.findFile(releaseId, path);
    if (file !== null) {
      return file;
    }
  }
  return null;
}

function storeFrom(store: {
  displayName: string;
  summary: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  areaServed: string | null;
  address: string | null;
}): SlotStore {
  return {
    displayName: store.displayName,
    summary: store.summary,
    logo: store.logoUrl,
    website: store.websiteUrl,
    area: store.areaServed,
    address: store.address,
  };
}

function slotProduct(product: PublicProduct): SlotProduct {
  const stocks = product.variants.map((variant) => variant.stock).filter((stock) => stock !== null);
  return {
    id: product.id,
    name: product.title,
    cover: product.cover,
    fields: product.fields,
    variants: product.variants.map((variant) => ({
      optionValues: variant.optionValues,
      stock: variant.stock,
      availability: variant.availability,
      priceMinor: variant.price,
    })),
    stock: stocks.length === 0 ? null : Math.min(...stocks),
    availability: product.offer.availability,
    priceMinor: product.offer.price,
  };
}

function productPathname(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    return /^\/products\/[^/]+$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

function injectJsonLd(html: string, script: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${script}</head>`);
  }
  return `${html}${script}`;
}

function withDiscoveryTags(
  html: string,
  pathname: string,
  request: Request,
  nextCursor: string | null,
): string {
  const tags = discoveryTags(pathname, request, nextCursor);
  if (tags.length === 0) {
    return html;
  }
  const withoutCanonical = html.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, "");
  const block = tags.join("");
  if (/<head[^>]*>/i.test(withoutCanonical)) {
    return withoutCanonical.replace(/<head[^>]*>/i, (head) => `${head}${block}`);
  }
  return `${block}${withoutCanonical}`;
}

function discoveryTags(pathname: string, request: Request, nextCursor: string | null): string[] {
  const links = discoveryPaths(pathname, request, nextCursor);
  if (links === null) {
    return [];
  }
  const tags = [
    `<link rel="canonical" href="${escapeAttr(absolutePublic(links.canonical))}">`,
    `<link rel="alternate" type="text/markdown" href="${escapeAttr(links.markdown)}">`,
    `<link rel="describedby" href="/llms.txt">`,
  ];
  if (links.prev !== null) {
    tags.push(`<link rel="prev" href="${escapeAttr(absolutePublic(links.prev))}">`);
  }
  if (links.next !== null) {
    tags.push(`<link rel="next" href="${escapeAttr(absolutePublic(links.next))}">`);
  }
  return tags;
}

function htmlResponse(
  html: string,
  pathname: string,
  request: Request,
  nextCursor: string | null,
  contentType: string,
): Response {
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const link = discoveryLinkHeader(pathname, request, nextCursor);
  if (link !== null) {
    headers.set("link", link);
  }
  return new Response(html, { status: 200, headers });
}

function discoveryLinkHeader(
  pathname: string,
  request: Request,
  nextCursor: string | null,
): string | null {
  const links = discoveryPaths(pathname, request, nextCursor);
  if (links === null) {
    return null;
  }
  const parts = [
    canonicalLink(links.canonical),
    alternateMarkdown(links.markdown),
    describedByLlms(),
  ];
  if (links.prev !== null) {
    parts.push(relationLink("prev", links.prev));
  }
  if (links.next !== null) {
    parts.push(relationLink("next", links.next));
  }
  return joinLinks(parts);
}

function discoveryPaths(
  pathname: string,
  request: Request,
  nextCursor: string | null,
): { canonical: string; markdown: string; prev: string | null; next: string | null } | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const cursor = new URL(request.url).searchParams.get("cursor");
  const requested = cursor !== null && cursor.length > 0 ? cursor : null;
  if (path === "/") {
    return { canonical: "/", markdown: "/index.md", prev: null, next: null };
  }
  if (path === "/products") {
    return {
      canonical:
        requested === null ? "/products" : `/products?cursor=${encodeURIComponent(requested)}`,
      markdown:
        requested === null
          ? "/products.md"
          : `/products.md?cursor=${encodeURIComponent(requested)}`,
      prev: requested === null ? null : "/products",
      next:
        nextCursor === null || nextCursor.length === 0
          ? null
          : `/products?cursor=${encodeURIComponent(nextCursor)}`,
    };
  }
  const id = productIdFromPath(path);
  if (id === null) {
    return null;
  }
  return {
    canonical: `/products/${id}`,
    markdown: `/products/${id}.md`,
    prev: null,
    next: null,
  };
}

function absolutePublic(path: string): string {
  return `${publicBaseUrl()}${path}`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function byteResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(binaryBody(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function textResponse(body: string, status: number, hidden: boolean): Response {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  if (hidden) {
    headers.set("x-robots-tag", "noindex, nofollow");
  }
  return new Response(body, { status, headers });
}

function binaryBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
