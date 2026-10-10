export type StorefrontError =
  "forbidden" | "not_found" | "validation_error" | "rate_limited" | "dependency_unavailable";

export type StorefrontFailure = {
  ok: false;
  error: StorefrontError;
  message: string;
};

export type StorefrontSuccess<T> = {
  ok: true;
  value: T;
};

export type StorefrontResult<T> = StorefrontSuccess<T> | StorefrontFailure;

export function storefrontOk<T>(value: T): StorefrontSuccess<T> {
  return { ok: true, value };
}

export function storefrontFail(error: StorefrontError, message: string): StorefrontFailure {
  return { ok: false, error, message };
}
