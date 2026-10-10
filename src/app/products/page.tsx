import type { Metadata } from "next";
import type { ReactNode } from "react";
import { slotProductFromPublic } from "../../public-discovery/documents";
import { jsonLdElement, loadProductList, pageDiscovery } from "../../public-discovery/model";
import { publicBaseUrl } from "../../public-discovery/site";
import { ProductListTemplate } from "../../public-discovery/views";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams?: Promise<{ cursor?: string | string[] }>;
};

export async function generateMetadata({
  searchParams,
}: ProductsPageProps = {}): Promise<Metadata> {
  const params = searchParams === undefined ? {} : await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const model = await loadProductList(cursor);
  return {
    metadataBase: new URL(publicBaseUrl()),
    ...pageDiscovery(model),
  };
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps = {}): Promise<ReactNode> {
  const params = searchParams === undefined ? {} : await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const model = await loadProductList(cursor);
  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: jsonLdElement(model.jsonLd) }} />
      <link rel="canonical" href={model.canonicalUrl} />
      <link rel="alternate" type="text/markdown" href={model.markdownPath} />
      <link rel="describedby" href="/llms.txt" />
      {model.prevUrl ? <link rel="prev" href={model.prevUrl} /> : null}
      {model.nextUrl ? <link rel="next" href={model.nextUrl} /> : null}
      <ProductListTemplate
        facts={{
          store: null,
          products: model.products.map(slotProductFromPublic),
          product: null,
          orderStatus: null,
          nextCursor: model.nextCursor,
          origin: publicBaseUrl(),
        }}
      />
    </>
  );
}
