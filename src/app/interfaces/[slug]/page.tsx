import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { interfaceOperationBySlug } from "../../../public-discovery/interface-docs";
import { InterfaceOperationPage } from "../../../public-discovery/views";
import { publicStore } from "../../../shared/seams/public-store";

export const dynamic = "force-dynamic";

type InterfacePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: InterfacePageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = interfaceOperationBySlug(slug);
  if (doc === null) {
    return { title: "没有找到接口", robots: { index: false, follow: false } };
  }
  return {
    title: `${doc.method} ${doc.path}`,
    description: doc.summary,
    robots: { index: true, follow: true },
  };
}

export default async function InterfaceSlugPage({
  params,
}: InterfacePageProps): Promise<ReactNode> {
  const { slug } = await params;
  const doc = interfaceOperationBySlug(slug);
  if (doc === null) {
    notFound();
  }
  const store = await publicStore.get();
  return (
    <InterfaceOperationPage method={doc.method} path={doc.path} storeName={store?.displayName} />
  );
}
