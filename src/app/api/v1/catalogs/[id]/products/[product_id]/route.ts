import {
  deleteProductRoute,
  patchProductRoute,
} from "../../../../../../../app-services/catalog/http";

type Context = { params: Promise<{ id: string; product_id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id, product_id: productId } = await context.params;
  return patchProductRoute(request, id, productId);
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id, product_id: productId } = await context.params;
  return deleteProductRoute(request, id, productId);
}
