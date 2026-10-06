import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadLanding } from "../public-discovery/model";
import { publicBaseUrl } from "../public-discovery/site";
import { LandingView } from "../public-discovery/views";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const model = await loadLanding();
  return {
    metadataBase: new URL(publicBaseUrl()),
    title: model.title,
    description: model.description,
    alternates: { canonical: model.canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default async function HomePage(): Promise<ReactNode> {
  return <LandingView model={await loadLanding()} />;
}
