import {
  deleteVariantRoute,
  patchVariantRoute,
} from "../../../../../../../app-services/catalog/http";

type Context = { params: Promise<{ id: string; variant_id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id, variant_id: variantId } = await context.params;
  return patchVariantRoute(request, id, variantId);
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { id, variant_id: variantId } = await context.params;
  return deleteVariantRoute(request, id, variantId);
}
