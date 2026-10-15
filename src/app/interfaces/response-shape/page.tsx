import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InterfaceResponseShapePage } from "../../../public-discovery/views";
import { publicStore } from "../../../shared/seams/public-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "响应结构",
  description: "JSON 响应的 code、message、data、timestamp 和 request_id",
  robots: { index: true, follow: true },
};

export default async function ResponseShapePage(): Promise<ReactNode> {
  const store = await publicStore.get();
  return <InterfaceResponseShapePage storeName={store?.displayName ?? null} />;
}
