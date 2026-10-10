import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadProduct, pageDiscovery } from "../../../public-discovery/model";
import { isPublicProductId } from "../../../public-discovery/negotiate";
import { publicBaseUrl } from "../../../public-discovery/site";
import { ProductView } from "../../../public-discovery/views";

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
  const model = await loadProduct(id);
  if (model.kind === "hidden") {
    // Unpublished, deleted, and unknown ids are not indexable. Next turns this into 404 + noindex.
    notFound();
  }
  return <ProductView model={model} />;
}
