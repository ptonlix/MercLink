import { postCatalogImage } from "../../../../../../app-services/catalog/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return postCatalogImage(request, id);
}
