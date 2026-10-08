import { randomBytes } from "node:crypto";
import { logRequest } from "./log";

export const requestIdPrefix = "req_";

// Same opaque length as createPublicId: base64url(16 bytes) is 22 characters.
const opaqueLength = 22;

export const requestIdLength = requestIdPrefix.length + opaqueLength;

const observed = new WeakMap<Request, string>();

export function createRequestId(): string {
  return `${requestIdPrefix}${randomBytes(16).toString("base64url")}`;
}

export function inboundRequestId(value: string | null): string | null {
  if (value === null || !value.startsWith(requestIdPrefix) || value.length !== requestIdLength) {
    return null;
  }
  return value;
}

export function observeRequest(request: Request): string {
  const existing = observed.get(request);
  if (existing !== undefined) {
    return existing;
  }
  const requestId = inboundRequestId(request.headers.get("x-request-id")) ?? createRequestId();
  observed.set(request, requestId);
  logRequest({
    method: request.method,
    path: new URL(request.url).pathname,
    headers: request.headers,
    requestId,
  });
  return requestId;
}
