import { placeOrder } from "../../../../app-services/commerce/place-order";
import { commerceRuntime } from "../../../../app-services/commerce/runtime";
import { errorResponse, graphJson } from "../../../../app-services/commerce/view";
import { runOnce } from "../../../../jobs/close-expired-orders";
import { authenticate } from "../../../../shared/seams/authenticate";

function keepScannerRegistered(): void {
  if (process.env.MERCLINK_RUN_EXPIRY === "1") {
    void runOnce();
  }
}

export async function POST(request: Request): Promise<Response> {
  keepScannerRegistered();
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("validation_error", "请求无效。");
  }
  const result = await placeOrder({ actor: auth.actor, body, runtime: commerceRuntime() });
  if (!result.ok) {
    return errorResponse(result.error, result.message);
  }
  return Response.json(graphJson(result.graph, result.action));
}
