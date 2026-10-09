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
  documentHasSlots,
  renderDocument,
  type SlotContext,
  type SlotProduct,
  type SlotStore,
} from "../../domain/storefront/slots";
import type { PublicProduct } from "../../shared/seams/public-products";
import { publicProducts } from "../../shared/seams/public-products";
import { publicStore } from "../../shared/seams/public-store";
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
  if (storefrontRewritePath(pathname, true) === null) {
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
  if (isReservedPath(pathname) || storefrontRewritePath(pathname, true) === null) {
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
    return serveFile(pointer.activeId, file, request, false);
  }
  if (release.fallback === fallbackFile) {
    const home = await runtime.store.findFile(pointer.activeId, fallbackFile);
    if (home !== null) {
      return serveFile(pointer.activeId, home, request, false);
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
    return serveFile(releaseId, file, request, true);
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
  return serveFile(releaseId, file, request, true, loaded.product);
}

async function serveFile(
  releaseId: string,
  file: FileRow,
  request: Request,
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
  if (!forceRender && !documentHasSlots(text)) {
    return byteResponse(object.bytes, file.contentType);
  }
  const rendered = renderDocument(text, await slotContext(request, onlyProduct));
  return byteResponse(new TextEncoder().encode(rendered), file.contentType);
}

async function slotContext(request: Request, onlyProduct?: PublicProduct): Promise<SlotContext> {
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
    store: store === null ? null : storeFrom(store),
    products: onlyProduct === undefined ? page.items.map(slotProduct) : [],
    product: onlyProduct === undefined ? null : slotProduct(onlyProduct),
    orderStatus,
    nextCursor: page.nextCursor,
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
