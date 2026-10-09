import { getStorefrontSource } from "../../../../../app-services/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return getStorefrontSource(request);
}
