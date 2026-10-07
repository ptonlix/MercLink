import { createHash } from "node:crypto";

export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
