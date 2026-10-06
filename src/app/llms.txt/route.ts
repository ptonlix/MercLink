import { llmsText } from "../../public-discovery/site";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(llmsText(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
