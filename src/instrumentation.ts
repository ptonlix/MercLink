// Starts migrations and logging only. Do not statically import business slices
// or Node-only modules. Next compiles this file for the Edge runtime as well.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const node = await import("./instrumentation.node");
  await node.registerNode();
}

export async function onRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string | string[] };
  },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { logRequest } = await import("./shared/log");
  const { createRequestId, inboundRequestId } = await import("./shared/request-id");
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const message = error instanceof Error ? error.message : "request failed";
  logRequest({
    method: request.method,
    path: request.path,
    headers,
    bodyText: message,
    requestId: inboundRequestId(headers.get("x-request-id")) ?? createRequestId(),
  });
}
