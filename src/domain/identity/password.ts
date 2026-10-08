const passwordMinLength = 8;

export function isArgon2idHash(value: string): boolean {
  return value.startsWith("$argon2id$");
}

export function passwordIsHashed(stored: string, plaintext: string): boolean {
  return stored !== plaintext && isArgon2idHash(stored);
}

export type PasswordDecision =
  { ok: true } | { ok: false; error: "validation_error"; message: string };

export function nextPasswordAccepted(password: string): PasswordDecision {
  if (password.trim().length < passwordMinLength) {
    return { ok: false, error: "validation_error", message: "密码至少 8 位。" };
  }
  return { ok: true };
}
