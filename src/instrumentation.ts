import { logRequest } from "./shared/log";

// Starts migrations and logging only. Do not statically import business slices.
// The integration change attaches the composition root here later.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const { boot } = await import("./shared/startup");
  await boot();
}

export function onRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string | string[] };
  },
): void {
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
  });
}
