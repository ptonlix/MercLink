import { llmsText, publicBaseUrl } from "../../public-discovery/site";
import { publicStore } from "../../shared/seams/public-store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const store = await publicStore.get();
  const quote = store === null ? null : { displayName: store.displayName, summary: store.summary };
  return new Response(llmsText(publicBaseUrl(), quote), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
