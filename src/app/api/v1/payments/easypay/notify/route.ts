import { applyPaymentNotification } from "../../../../../../app-services/commerce/notify-payment";
import { commerceRuntime } from "../../../../../../app-services/commerce/runtime";

async function notify(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.method === "GET" ? url.searchParams.toString() : await request.text();
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const result = await applyPaymentNotification({
    body,
    headers,
    runtime: commerceRuntime(),
    provider: "easypay",
    unknownPayment: "success",
  });
  return new Response(result.ok ? "success" : "fail", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const GET = notify;
export const POST = notify;
