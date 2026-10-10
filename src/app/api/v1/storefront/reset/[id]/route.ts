import { getStorefrontReset } from "../../../../../../app-services/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return context.params.then((params) => getStorefrontReset(request, params.id));
}
