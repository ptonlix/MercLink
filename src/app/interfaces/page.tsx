import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InterfaceDirectory } from "../../public-discovery/views";
import { absoluteUrl, interfaceDirectoryLabel, publicBaseUrl } from "../../public-discovery/site";
import { publicStore } from "../../shared/seams/public-store";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(publicBaseUrl()),
    title: interfaceDirectoryLabel,
    description: "接口文档，默认展示第一条接口的请求和响应",
    alternates: { canonical: absoluteUrl("/interfaces") },
    robots: { index: true, follow: true },
  };
}

export default async function InterfacesPage(): Promise<ReactNode> {
  const store = await publicStore.get();
  return <InterfaceDirectory storeName={store?.displayName ?? null} />;
}
