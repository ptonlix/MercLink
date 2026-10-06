import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadProduct } from "../../../public-discovery/model";
import { publicBaseUrl } from "../../../public-discovery/site";
import { ProductView } from "../../../public-discovery/views";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
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
    title: model.title,
    description: model.description,
    alternates: { canonical: model.canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default async function ProductPage({ params }: ProductPageProps): Promise<ReactNode> {
  const { id } = await params;
  const model = await loadProduct(id);
  if (model.kind === "hidden") {
    // Unpublished, deleted, and unknown ids are not indexable. Next turns this into 404 + noindex.
    notFound();
  }
  return <ProductView model={model} />;
}
