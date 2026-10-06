import type { PublicListQuery, PublicProduct } from "../shared/seams/public-products";
import { publicProducts } from "../shared/seams/public-products";
import {
  absoluteUrl,
  emptyProductsNote,
  productSitemapEntry,
  publicBaseUrl,
  serviceDescription,
  siteName,
  staticSitemapEntries,
  type SitemapEntry,
} from "./site";

const listLimit = 20;
const sitemapPageLimit = 100;

export type LandingModel = {
  title: string;
  description: string;
  canonicalUrl: string;
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
  "@graph": [JsonLdNode, ItemListJsonLd];
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

export async function loadLanding(): Promise<LandingModel> {
  const page = await publicProducts.list({ limit: listLimit });
  const origin = publicBaseUrl();
  const description = serviceDescription;
  return {
    title: siteName,
    description,
    canonicalUrl: absoluteUrl("/", origin),
    products: page.items,
    nextCursor: page.nextCursor,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: siteName,
          description,
          url: absoluteUrl("/", origin),
        },
        itemList(page.items, origin),
      ],
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
