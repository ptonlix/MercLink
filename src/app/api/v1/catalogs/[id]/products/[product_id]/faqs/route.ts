import {
  getProductFaqs,
  putProductFaqs,
} from "../../../../../../../../app-services/identity/faq-http";

type Context = { params: Promise<{ id: string; product_id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id, product_id: productId } = await context.params;
  return getProductFaqs(request, id, productId);
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { id, product_id: productId } = await context.params;
  return putProductFaqs(request, id, productId);
}
