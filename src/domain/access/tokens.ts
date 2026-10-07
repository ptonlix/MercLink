import { timingSafeEqual } from "node:crypto";
import { tokenHash } from "../../shared/token-hash";

export const accessTokenTtlSeconds = 15 * 60;
export const deviceCodeTtlSeconds = 10 * 60;
export const refreshTokenTtlSeconds = 30 * 24 * 60 * 60;

export { tokenHash };

export function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function refreshTokenUsable(input: {
  presentedHash: string;
  storedHash: string | null;
  revokedAt: Date | null;
}): boolean {
  if (input.revokedAt !== null || input.storedHash === null) {
    return false;
  }
  return sameHash(input.presentedHash, input.storedHash);
}

export function rotatedRefresh(nextHash: string): { storedHash: string; previousUsable: false } {
  return { storedHash: nextHash, previousUsable: false };
}

export function otherGrantUnaffected(revokedGrantId: string, otherGrantId: string): boolean {
  return revokedGrantId !== otherGrantId;
}
