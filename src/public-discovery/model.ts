import type { PublicListQuery, PublicProduct } from "../shared/seams/public-products";
import { publicProducts } from "../shared/seams/public-products";
import { publicStore, type PublicStoreProfile } from "../shared/seams/public-store";
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
  store: PublicStoreProfile | null;
  products: readonly PublicProduct[];
  nextCursor: string | null;
  jsonLd: LandingJsonLd;
};

export type ProductListModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  products: readonly PublicProduct[];
  nextCursor: string | null;
  jsonLd: ItemListJsonLd;
};

export type VisibleProductModel = {
  kind: "visible";
  title: string;
  description: string;
  canonicalUrl: string;
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
  offers: OfferJsonLd;
};

type OfferJsonLd = {
  "@type": "Offer";
  price: number;
  priceCurrency: string;
  availability: PublicProduct["offer"]["availability"];
};

export function jsonLdScript(value: unknown): string {
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
  const query: PublicListQuery = { limit: listLimit };
  if (cursor !== undefined && cursor.length > 0) {
    query.cursor = cursor;
  }
  const page = await publicProducts.list(query);
  const origin = publicBaseUrl();
  const description = "当前已上架商品列表。";
  return {
    title: "已上架商品",
    description,
    canonicalUrl: absoluteUrl("/products", origin),
    products: page.items,
    nextCursor: page.nextCursor,
    jsonLd: {
      "@context": "https://schema.org",
      ...itemList(page.items, origin),
    },
  };
}

export async function loadProduct(id: string): Promise<ProductModel> {
  const result = await publicProducts.get(id);
  if (!result.ok) {
    return {
      kind: "hidden",
      status: 404,
      indexable: false,
      title: "没有找到商品",
      description: emptyProductsNote,
    };
  }
  const product = result.product;
  const origin = publicBaseUrl();
  const description = productDescription(product);
  return {
    kind: "visible",
    title: product.title,
    description,
    canonicalUrl: absoluteUrl(`/products/${product.id}`, origin),
    product,
    jsonLd: productJsonLd(product),
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
  return `${product.title}。价格 ${String(product.offer.price)} 分，货币 ${product.offer.currency}，可售状态 ${product.offer.availability}。`;
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
  const jsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    offers: {
      "@type": "Offer",
      price: product.offer.price,
      priceCurrency: product.offer.currency,
      availability: product.offer.availability,
    },
  };
  if (product.cover !== null && isHttpUrl(product.cover)) {
    jsonLd.image = product.cover;
  }
  return jsonLd;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
