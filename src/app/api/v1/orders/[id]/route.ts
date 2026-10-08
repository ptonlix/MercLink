import { readBuyerOrder } from "../../../../../app-services/commerce/read-order";
import { commerceRuntime } from "../../../../../app-services/commerce/runtime";
import { errorResponse, graphJson } from "../../../../../app-services/commerce/view";
import { apiSuccess } from "../../../../../shared/errors";
import { authenticate } from "../../../../../shared/seams/authenticate";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  const params = await context.params;
  const result = await readBuyerOrder({
    actor: auth.actor,
    orderId: params.id,
    runtime: commerceRuntime(),
  });
  if (!result.ok) {
    return errorResponse(result.error, result.message, request);
  }
  return apiSuccess(graphJson(result.graph, null), { request });
}
