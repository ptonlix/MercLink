import { createHmac, timingSafeEqual } from "node:crypto";

type AdminSession = {
  kind: "admin";
  adminId: string;
  exp: number;
};

type AccountSession = {
  kind: "account";
  ownerType: "merchant" | "buyer";
  ownerId: string;
  exp: number;
};

export type SessionPayload = AdminSession | AccountSession;

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function readSession(token: string, secret: string, now: Date): SessionPayload | null {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return null;
  }
  const body = token.slice(0, separator);
  const sig = token.slice(separator + 1);
  if (!signaturesMatch(sig, signature(body, secret))) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isSession(parsed) || parsed.exp * 1000 <= now.getTime()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is SessionPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.exp !== "number") {
    return false;
  }
  if (record.kind === "admin") {
    return typeof record.adminId === "string";
  }
  return (
    record.kind === "account" &&
    (record.ownerType === "merchant" || record.ownerType === "buyer") &&
    typeof record.ownerId === "string"
  );
}

export const adminCookie = "ml_admin";
export const accountCookie = "ml_account";
export const sessionTtlSeconds = 12 * 60 * 60;
