import { postStorefrontActivate } from "../../../../../../../app-services/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return context.params.then(({ id }) => postStorefrontActivate(request, id));
}
