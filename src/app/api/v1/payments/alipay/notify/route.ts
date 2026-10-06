import { applyPaymentNotification } from "../../../../../../app-services/commerce/notify-payment";
import { commerceRuntime } from "../../../../../../app-services/commerce/runtime";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const result = await applyPaymentNotification({
    body,
    headers,
    runtime: commerceRuntime(),
  });
  return new Response(result.ok ? "success" : "fail", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
