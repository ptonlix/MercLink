import type { MetadataRoute } from "next";
import { visibleSitemapEntries } from "../app-services/storefront/serve";
import { publicSitemap } from "../public-discovery/model";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await visibleSitemapEntries(await publicSitemap());
  return entries.map((entry) => ({ url: entry.url }));
}
