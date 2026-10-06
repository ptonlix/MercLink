export type CatalogErrorCode =
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "unknown_field"
  | "field_retired"
  | "variant_required"
  | "insufficient_stock"
  | "conflict";

export type CatalogFailure = {
  ok: false;
  error: CatalogErrorCode;
  message: string;
};

export type CatalogSuccess<T> = {
  ok: true;
  value: T;
};

export type CatalogResult<T> = CatalogSuccess<T> | CatalogFailure;

export function catalogOk<T>(value: T): CatalogSuccess<T> {
  return { ok: true, value };
}

export function catalogFail(error: CatalogErrorCode, message: string): CatalogFailure {
  return { ok: false, error, message };
}

export function isCatalogFailure(value: { ok: boolean }): value is CatalogFailure {
  return !value.ok;
}
