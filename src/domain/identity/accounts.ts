export type MerchantStatus = "active" | "disabled";

export function shouldCreateSuperAdmin(existingCount: number): boolean {
  return existingCount === 0;
}

export function provisionedMerchant(): { status: "active"; mustChangePassword: true } {
  return { status: "active", mustChangePassword: true };
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

export const storeMerchantName = "本店";

export const singleStoreMessage = "这一套部署只有一家店。";

export const unknownMerchantMessage = "请使用店主手机号登录。";

export function shouldCreateStoreMerchant(existingCount: number): boolean {
  return existingCount === 0;
}
