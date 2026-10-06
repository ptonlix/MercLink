export type MerchantStatus = "active" | "disabled";

export function shouldCreateSuperAdmin(existingCount: number): boolean {
  return existingCount === 0;
}

export function activePhoneAvailable(
  activeExists: boolean,
): { ok: true } | { ok: false; message: string } {
  if (activeExists) {
    return { ok: false, message: "该手机号已开通。" };
  }
  return { ok: true };
}

export function provisionedMerchant(): { status: "active"; mustChangePassword: true } {
  return { status: "active", mustChangePassword: true };
}

export function disableMerchantEffects(): {
  status: "disabled";
  revokeGrants: true;
  revokeApiKeys: true;
  keepAccount: true;
} {
  return { status: "disabled", revokeGrants: true, revokeApiKeys: true, keepAccount: true };
}

export function merchantCanAuthenticate(input: {
  status: MerchantStatus;
  deletedAt: Date | null;
}): boolean {
  return input.status === "active" && input.deletedAt === null;
}

export function merchantCanApproveAgent(input: {
  status: MerchantStatus;
  deletedAt: Date | null;
  mustChangePassword: boolean;
}): boolean {
  return merchantCanAuthenticate(input) && !input.mustChangePassword;
}

export const unknownMerchantMessage = "请联系管理员开通";
