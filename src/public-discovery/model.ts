import type { PublicListQuery, PublicProduct } from "../shared/seams/public-products";
import { publicProducts } from "../shared/seams/public-products";
import { publicStore, type PublicStoreProfile } from "../shared/seams/public-store";
import { isPublicProductId } from "./negotiate";
import {
  availabilityText,
  displayPrice,
  majorUnitDecimal,
  schemaAvailability,
} from "./presentation";
import {
  absoluteUrl,
  emptyProductsNote,
  productSitemapEntry,
  publicBaseUrl,
  siteName,
  staticSitemapEntries,
  storeExplanation,
  type SitemapEntry,
} from "./site";

const listLimit = 20;
const sitemapPageLimit = 100;

const metaDescriptionLimit = 150;

export type LandingModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  markdownPath: string;
  store: PublicStoreProfile | null;
  products: readonly PublicProduct[];
  nextCursor: string | null;
  jsonLd: LandingJsonLd;
};

export type ProductListModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  markdownPath: string;
  prevUrl: string | null;
  nextUrl: string | null;
  products: readonly PublicProduct[];
  nextCursor: string | null;
  jsonLd: ItemListJsonLd;
};

export type VisibleProductModel = {
  kind: "visible";
  title: string;
  description: string;
  canonicalUrl: string;
  markdownPath: string;
  product: PublicProduct;
  jsonLd: ProductJsonLd;
};

type HiddenProductModel = {
  kind: "hidden";
  status: 404;
  indexable: false;
  title: string;
  description: string;
};

export type ProductModel = VisibleProductModel | HiddenProductModel;

type JsonLdNode = {
  "@type": string;
  [key: string]: unknown;
};

type LandingJsonLd = {
  "@context": "https://schema.org";
  "@graph": readonly JsonLdNode[];
};

type ItemListJsonLd = {
  "@context"?: "https://schema.org";
  "@type": "ItemList";
  numberOfItems: number;
  itemListElement: readonly ListItemJsonLd[];
};

type ListItemJsonLd = {
  "@type": "ListItem";
  position: number;
  name: string;
  url: string;
};

type ProductJsonLd = {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  image?: string;
  offers: readonly OfferJsonLd[];
};

type OfferJsonLd = {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: "https://schema.org/InStock" | "https://schema.org/OutOfStock";
  sku?: string;
};

export type PageDiscovery = {
  title: string;
  description: string;
  alternates: {
    canonical: string;
    types: { "text/markdown": string };
  };
  pagination?: {
    previous?: string;
    next?: string;
  };
  robots: { index: true; follow: true };
};

function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function truncateChars(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

export async function loadLanding(): Promise<LandingModel> {
  const [page, store] = await Promise.all([
    publicProducts.list({ limit: listLimit }),
    publicStore.get(),
  ]);
  const origin = publicBaseUrl();
  const description =
    store === null ? storeExplanation : truncateChars(store.summary, metaDescriptionLimit);
  const title = store === null ? siteName : store.displayName;
  const graph: JsonLdNode[] = [];
  if (store !== null) {
    graph.push(onlineStore(store, origin));
  }
  graph.push(itemList(page.items, origin));
  return {
    title,
    description,
    canonicalUrl: absoluteUrl("/", origin),
    markdownPath: "/index.md",
    store,
    products: page.items,
    nextCursor: page.nextCursor,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": graph,
    },
  };
}

export async function loadProductList(cursor?: string): Promise<ProductListModel> {
  const requested = cursor !== undefined && cursor.length > 0 ? cursor : undefined;
  const query: PublicListQuery = { limit: listLimit };
  if (requested !== undefined) {
    query.cursor = requested;
  }
  const page = await publicProducts.list(query);
  const origin = publicBaseUrl();
  const description = "当前已上架商品列表。";
  const canonicalPath =
    requested === undefined ? "/products" : `/products?cursor=${encodeURIComponent(requested)}`;
  const markdownPath =
    requested === undefined
      ? "/products.md"
      : `/products.md?cursor=${encodeURIComponent(requested)}`;
  return {
    title: "已上架商品",
    description,
    canonicalUrl: absoluteUrl(canonicalPath, origin),
    markdownPath,
    prevUrl: requested === undefined ? null : absoluteUrl("/products", origin),
    nextUrl:
      page.nextCursor === null
        ? null
        : absoluteUrl(`/products?cursor=${encodeURIComponent(page.nextCursor)}`, origin),
    products: page.items,
    nextCursor: page.nextCursor,
    jsonLd: {
      "@context": "https://schema.org",
      ...itemList(page.items, origin),
    },
  };
}

export async function loadProduct(id: string): Promise<ProductModel> {
  if (!isPublicProductId(id)) {
    return hiddenProduct();
  }
  const result = await publicProducts.get(id);
  if (!result.ok) {
    return hiddenProduct();
  }
  const product = result.product;
  const origin = publicBaseUrl();
  const description = productDescription(product);
  return {
    kind: "visible",
    title: product.title,
    description,
    canonicalUrl: absoluteUrl(`/products/${product.id}`, origin),
    markdownPath: `/products/${product.id}.md`,
    product,
    jsonLd: productJsonLd(product),
  };
}

function hiddenProduct(): HiddenProductModel {
  return {
    kind: "hidden",
    status: 404,
    indexable: false,
    title: "没有找到商品",
    description: emptyProductsNote,
  };
}

export function pageDiscovery(input: {
  title: string;
  description: string;
  canonicalUrl: string;
  markdownPath: string;
  prevUrl?: string | null;
  nextUrl?: string | null;
}): PageDiscovery {
  const pagination: { previous?: string; next?: string } = {};
  if (input.prevUrl) {
    pagination.previous = input.prevUrl;
  }
  if (input.nextUrl) {
    pagination.next = input.nextUrl;
  }
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: input.canonicalUrl,
      types: { "text/markdown": absoluteUrl(input.markdownPath) },
    },
    ...(input.prevUrl || input.nextUrl ? { pagination } : {}),
    robots: { index: true, follow: true },
  };
}

export async function publicSitemap(): Promise<readonly SitemapEntry[]> {
  const origin = publicBaseUrl();
  const entries = staticSitemapEntries(origin);
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const query: PublicListQuery = { limit: sitemapPageLimit };
    if (cursor !== undefined) {
      query.cursor = cursor;
    }
    const page = await publicProducts.list(query);
    for (const product of page.items) {
      if (seen.has(product.id)) {
        continue;
      }
      seen.add(product.id);
      entries.push(productSitemapEntry(product.id, origin));
    }
    if (page.items.length === 0 || page.nextCursor === null || cursors.has(page.nextCursor)) {
      break;
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return entries;
}

function onlineStore(store: PublicStoreProfile, origin: string): JsonLdNode {
  const node: JsonLdNode = {
    "@type": "OnlineStore",
    name: store.displayName,
    description: store.summary,
    url: absoluteUrl("/", origin),
  };
  if (store.logoUrl !== null && isHttpUrl(store.logoUrl)) {
    node.logo = store.logoUrl;
  }
  if (store.websiteUrl !== null && isHttpUrl(store.websiteUrl)) {
    node.sameAs = store.websiteUrl;
  }
  if (store.areaServed !== null && store.areaServed.length > 0) {
    node.areaServed = store.areaServed;
  }
  if (store.address !== null && store.address.length > 0) {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: store.address,
    };
  }
  return node;
}

function productDescription(product: PublicProduct): string {
  const text = `${product.title}。${displayPrice(product.offer.price, product.offer.currency)}，${availabilityText(product.offer.availability)}`;
  return truncateChars(text, metaDescriptionLimit);
}

function itemList(products: readonly PublicProduct[], origin: string): ItemListJsonLd {
  return {
    "@type": "ItemList",
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.title,
      url: absoluteUrl(`/products/${product.id}`, origin),
    })),
  };
}

function productJsonLd(product: PublicProduct): ProductJsonLd {
  const sources =
    product.variants.length > 0
      ? product.variants
      : [
          {
            price: product.offer.price,
            currency: product.offer.currency,
            availability: product.offer.availability,
            sku: null,
          },
        ];
  const jsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    offers: sources.map(offerJsonLd),
  };
  if (product.cover !== null && isHttpUrl(product.cover)) {
    jsonLd.image = product.cover;
  }
  return jsonLd;
}

function offerJsonLd(variant: {
  price: number;
  currency: string;
  availability: PublicProduct["offer"]["availability"];
  sku: string | null;
}): OfferJsonLd {
  const offer: OfferJsonLd = {
    "@type": "Offer",
    price: majorUnitDecimal(variant.price),
    priceCurrency: variant.currency,
    availability: schemaAvailability(variant.availability),
  };
  if (variant.sku !== null && variant.sku.length > 0) {
    offer.sku = variant.sku;
  }
  return offer;
}

export function serverFactJsonLd(input: {
  declaresStore: boolean;
  declaresProduct: boolean;
  store: PublicStoreProfile | null;
  products: readonly PublicProduct[];
  product: PublicProduct | null;
  origin?: string;
}): unknown {
  const origin = input.origin ?? publicBaseUrl();
  const nodes: JsonLdNode[] = [];
  if (input.declaresStore && input.store !== null) {
    nodes.push(onlineStore(input.store, origin));
  }
  if (input.declaresProduct) {
    if (input.product !== null) {
      nodes.push(productNode(input.product));
    } else {
      nodes.push(itemList(input.products, origin));
    }
  }
  if (nodes.length === 0) {
    return null;
  }
  const only = nodes[0];
  if (nodes.length === 1 && only !== undefined) {
    return { "@context": "https://schema.org", ...only };
  }
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

function productNode(product: PublicProduct): JsonLdNode {
  const document = productJsonLd(product);
  return {
    "@type": document["@type"],
    name: document.name,
    offers: document.offers,
    ...(document.image === undefined ? {} : { image: document.image }),
  };
}

export function jsonLdElement(value: unknown): string {
  return `<script type="application/ld+json">${jsonLdScript(value)}</script>`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
