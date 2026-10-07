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

export type ApiErrorBody = {
  error: ErrorCode;
  message: string;
};

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

export function isErrorCode(value: string): value is ErrorCode {
  return (errorCodes as readonly string[]).includes(value);
}

export function errorBody(error: ErrorCode, message: string): ApiErrorBody {
  const readable = message.split("\n")[0] ?? "Request failed";
  return { error, message: readable };
}

export function apiError(
  error: ErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return Response.json(errorBody(error, message), { status, headers });
}
