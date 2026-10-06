import { publishProductRoute } from "../../../../../../../../app-services/catalog/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; product_id: string }> },
): Promise<Response> {
  const { id, product_id: productId } = await context.params;
  return publishProductRoute(request, id, productId);
}
