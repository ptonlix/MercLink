import { resolveUnappliedReceipt } from "../../../../../../../app-services/commerce/resolve-receipt";
import { commerceRuntime } from "../../../../../../../app-services/commerce/runtime";
import { errorResponse, graphJson } from "../../../../../../../app-services/commerce/view";
import { apiSuccess } from "../../../../../../../shared/errors";
import { authenticate } from "../../../../../../../shared/seams/authenticate";

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> | { paymentId: string } },
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("validation_error", "请求无效。", request);
  }
  const params = await context.params;
  const result = await resolveUnappliedReceipt({
    actor: auth.actor,
    paymentId: params.paymentId,
    body,
    runtime: commerceRuntime(),
  });
  if (!result.ok) {
    return errorResponse(result.error, result.message, request);
  }
  return apiSuccess(graphJson(result.graph, null, result.receipt), { request });
}
