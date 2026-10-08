import { getProduct } from "../../../../../app-services/catalog/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return getProduct(id, request);
}
