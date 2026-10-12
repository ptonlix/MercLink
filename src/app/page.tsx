import type { Metadata } from "next";
import type { ReactNode } from "react";
import { slotProductFromPublic, slotStoreFromPublic } from "../public-discovery/documents";
import { jsonLdElement, loadLanding, pageDiscovery } from "../public-discovery/model";
import { publicBaseUrl } from "../public-discovery/site";
import { LandingTemplate } from "../public-discovery/views";

export const dynamic = "force-dynamic";

type HomePageProps = { searchParams?: Promise<{ cursor?: string | string[] }> };

async function homeCursor({ searchParams }: HomePageProps): Promise<string | undefined> {
  const params = searchParams === undefined ? {} : await searchParams;
  return typeof params.cursor === "string" ? params.cursor : undefined;
}

export async function generateMetadata(props: HomePageProps = {}): Promise<Metadata> {
  const model = await loadLanding(await homeCursor(props));
  return {
    metadataBase: new URL(publicBaseUrl()),
    ...pageDiscovery(model),
  };
}

export default async function HomePage(props: HomePageProps = {}): Promise<ReactNode> {
  const cursor = await homeCursor(props);
  const model = await loadLanding(cursor);
  const facts = {
    store: slotStoreFromPublic(model.store),
    products: model.products.map(slotProductFromPublic),
    product: null,
    orderStatus: null,
    nextCursor: model.nextCursor,
    origin: publicBaseUrl(),
  };
  return (
    <>
      <Discovery
        jsonLd={model.jsonLd}
        canonical={model.canonicalUrl}
        markdown={model.markdownPath}
        prev={cursor ? "/" : null}
        next={model.nextCursor ? `/?cursor=${encodeURIComponent(model.nextCursor)}` : null}
      />
      <LandingTemplate facts={facts} paginated={Boolean(cursor)} />
    </>
  );
}

function Discovery({
  jsonLd,
  canonical,
  markdown,
  prev,
  next,
}: {
  jsonLd: object;
  canonical: string;
  markdown: string;
  prev?: string | null;
  next?: string | null;
}): ReactNode {
  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: jsonLdElement(jsonLd) }} />
      <link rel="canonical" href={canonical} />
      <link rel="alternate" type="text/markdown" href={markdown} />
      <link rel="describedby" href="/llms.txt" />
      {prev ? <link rel="prev" href={prev} /> : null}
      {next ? <link rel="next" href={next} /> : null}
    </>
  );
}
