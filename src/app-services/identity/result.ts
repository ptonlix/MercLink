import type { ErrorCode } from "../../shared/errors";

export type Failure = {
  ok: false;
  status: number;
  error: ErrorCode;
  message: string;
};

export function failure(status: number, error: ErrorCode, message: string): Failure {
  return { ok: false, status, error, message };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
