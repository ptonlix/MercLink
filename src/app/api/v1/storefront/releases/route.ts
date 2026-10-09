import { postStorefrontRelease } from "../../../../../app-services/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return postStorefrontRelease(request);
}
