import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadProductList, pageDiscovery } from "../../public-discovery/model";
import { publicBaseUrl } from "../../public-discovery/site";
import { ProductListView } from "../../public-discovery/views";

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
  return <ProductListView model={await loadProductList(cursor)} />;
}
