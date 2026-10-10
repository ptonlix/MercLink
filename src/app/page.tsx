import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadLanding, pageDiscovery } from "../public-discovery/model";
import { publicBaseUrl } from "../public-discovery/site";
import { LandingView } from "../public-discovery/views";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const model = await loadLanding();
  return {
    metadataBase: new URL(publicBaseUrl()),
    ...pageDiscovery(model),
  };
}

export default async function HomePage(): Promise<ReactNode> {
  return <LandingView model={await loadLanding()} />;
}
