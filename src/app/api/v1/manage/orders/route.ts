import { listMerchantOrders } from "../../../../../app-services/commerce/read-order";
import { commerceRuntime } from "../../../../../app-services/commerce/runtime";
import { errorResponse, graphJson } from "../../../../../app-services/commerce/view";
import { authenticate } from "../../../../../shared/seams/authenticate";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  const catalogId = new URL(request.url).searchParams.get("catalog_id") ?? undefined;
  const result = await listMerchantOrders({
    actor: auth.actor,
    ...(catalogId === undefined ? {} : { catalogId }),
    runtime: commerceRuntime(),
  });
  if (!result.ok) {
    return errorResponse(result.error, result.message);
  }
  return Response.json({
    items: result.graphs.map((graph) => graphJson(graph, null)),
  });
}
