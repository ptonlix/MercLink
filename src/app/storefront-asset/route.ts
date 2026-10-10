import { serveStorefront } from "../../app-services/storefront/serve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return serveAsset(request);
}

export function HEAD(request: Request): Promise<Response> {
  return serveAsset(request);
}

async function serveAsset(request: Request): Promise<Response> {
  const pathname = request.headers.get("x-storefront-path");
  if (pathname === null || pathname.length === 0) {
    return new Response("没有找到。", {
      status: 404,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  const served = await serveStorefront(pathname, request.url, request);
  if (served === null) {
    return new Response("没有找到。", {
      status: 404,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  return served;
}
