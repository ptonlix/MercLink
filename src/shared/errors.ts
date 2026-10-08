import { systemClock } from "../ports/clock";
import { logRequest } from "./log";
import { createRequestId, observeRequest } from "./request-id";

export const successCode = 200;

export const successMessage = "成功";

export const errorCodes = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "unknown_field",
  "field_retired",
  "too_many_items",
  "variant_required",
  "insufficient_stock",
  "conflict",
  "captcha_required",
  "sms_rate_limited",
  "rate_limited",
  "payment_retryable",
  "invalid_signature",
  "dependency_unavailable",
  "password_change_required",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type ErrorDefinition = {
  code: number;
  status: number;
};

// Sole business-code and HTTP status table. Callers cannot pass another failure status.
export const errorDefinitions = {
  validation_error: { code: 40000, status: 400 },
  unknown_field: { code: 40001, status: 400 },
  field_retired: { code: 40002, status: 400 },
  too_many_items: { code: 40003, status: 400 },
  variant_required: { code: 40004, status: 400 },
  captcha_required: { code: 40005, status: 400 },
  invalid_signature: { code: 40006, status: 400 },
  sms_rate_limited: { code: 40007, status: 400 },
  unauthorized: { code: 40100, status: 401 },
  forbidden: { code: 40300, status: 403 },
  password_change_required: { code: 40301, status: 403 },
  not_found: { code: 40400, status: 404 },
  conflict: { code: 40900, status: 409 },
  insufficient_stock: { code: 40901, status: 409 },
  rate_limited: { code: 42900, status: 429 },
  payment_retryable: { code: 50300, status: 503 },
  dependency_unavailable: { code: 50301, status: 503 },
} as const satisfies Record<ErrorCode, ErrorDefinition>;

const requiredCodes = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "unknown_field",
  "field_retired",
  "too_many_items",
  "variant_required",
  "insufficient_stock",
  "conflict",
  "captcha_required",
  "sms_rate_limited",
  "payment_retryable",
  "invalid_signature",
  "dependency_unavailable",
] as const satisfies readonly ErrorCode[];

export const minimumErrorCodes: readonly ErrorCode[] = requiredCodes;

export type ApiEnvelope = {
  code: number;
  message: string;
  data: unknown;
  timestamp: number;
  request_id: string;
};

export type ApiSuccessInit = {
  status?: 200 | 201;
  headers?: HeadersInit;
  request?: Request;
};

export type ApiFailureInit = {
  headers?: HeadersInit;
  request?: Request;
};

export function isErrorCode(value: string): value is ErrorCode {
  return (errorCodes as readonly string[]).includes(value);
}

export function businessCode(error: ErrorCode): number {
  return errorDefinitions[error].code;
}

export function httpStatusFor(error: ErrorCode): number {
  return errorDefinitions[error].status;
}

export function firstLineMessage(message: string): string {
  return message.split("\n")[0] ?? "Request failed";
}

export function apiSuccess(data: unknown, init: ApiSuccessInit = {}): Response {
  return envelope({
    code: successCode,
    message: successMessage,
    data,
    status: init.status ?? 200,
    headers: init.headers,
    request: init.request,
  });
}

export function apiFailure(error: ErrorCode, message: string, init: ApiFailureInit = {}): Response {
  return envelope({
    code: businessCode(error),
    message: firstLineMessage(message),
    data: null,
    status: httpStatusFor(error),
    headers: init.headers,
    request: init.request,
  });
}

function envelope(input: {
  code: number;
  message: string;
  data: unknown;
  status: number;
  headers?: HeadersInit;
  request?: Request;
}): Response {
  const requestId =
    input.request === undefined ? unboundRequestId() : observeRequest(input.request);
  const headers = new Headers(input.headers);
  headers.set("X-Request-Id", requestId);
  const body: ApiEnvelope = {
    code: input.code,
    message: input.message,
    data: input.data,
    timestamp: systemClock.now().getTime(),
    request_id: requestId,
  };
  return Response.json(body, { status: input.status, headers });
}

function unboundRequestId(): string {
  const requestId = createRequestId();
  logRequest({
    method: "ENVELOPE",
    path: "",
    headers: new Headers(),
    requestId,
  });
  return requestId;
}
