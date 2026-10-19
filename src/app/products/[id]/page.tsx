import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { slotProductFromPublic, slotStoreFromPublic } from "../../../public-discovery/documents";
import {
  faqPageDocument,
  jsonLdElement,
  loadProduct,
  pageDiscovery,
} from "../../../public-discovery/model";
import { isPublicProductId } from "../../../public-discovery/negotiate";
import { publicBaseUrl } from "../../../public-discovery/site";
import { ProductTemplate } from "../../../public-discovery/views";
import { publicStore } from "../../../shared/seams/public-store";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isPublicProductId(id)) {
    return {
      title: "没有找到商品",
      description: "没有可展示的商品。",
      robots: { index: false, follow: false },
    };
  }
  const model = await loadProduct(id);
  if (model.kind === "hidden") {
    return {
      title: model.title,
      description: model.description,
      robots: { index: false, follow: false },
    };
  }
  return {
    metadataBase: new URL(publicBaseUrl()),
    ...pageDiscovery(model),
  };
}

export default async function ProductPage({ params }: ProductPageProps): Promise<ReactNode> {
  const { id } = await params;
  if (!isPublicProductId(id)) {
    notFound();
  }
  const [model, store] = await Promise.all([loadProduct(id), publicStore.get()]);
  if (model.kind === "hidden") {
    notFound();
  }
  const faqLd = faqPageDocument(model.product.faqs ?? []);
  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: jsonLdElement(model.jsonLd) }} />
      {faqLd === null ? null : <span dangerouslySetInnerHTML={{ __html: jsonLdElement(faqLd) }} />}
      <link rel="canonical" href={model.canonicalUrl} />
      <link rel="alternate" type="text/markdown" href={model.markdownPath} />
      <link rel="describedby" href="/llms.txt" />
      <ProductTemplate
        facts={{
          store: slotStoreFromPublic(store),
          products: [],
          product: slotProductFromPublic(model.product),
          orderStatus: null,
          nextCursor: null,
          origin: publicBaseUrl(),
        }}
      />
    </>
  );
}
