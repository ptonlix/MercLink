import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadProductList } from "../../public-discovery/model";
import { publicBaseUrl } from "../../public-discovery/site";
import { ProductListView } from "../../public-discovery/views";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams?: Promise<{ cursor?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const model = await loadProductList();
  return {
    metadataBase: new URL(publicBaseUrl()),
    title: model.title,
    description: model.description,
    alternates: { canonical: model.canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps = {}): Promise<ReactNode> {
  const params = searchParams === undefined ? {} : await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  return <ProductListView model={await loadProductList(cursor)} />;
}
