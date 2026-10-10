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

const adminNextPattern = /^\/admin\/[A-Za-z0-9/_-]{1,200}$/;

export function safeAdminNext(value: string): string | null {
  if (!adminNextPattern.test(value) || value.includes("..")) {
    return null;
  }
  return value;
}

export type AdminLanding = "password" | "settled" | { returnTo: string };

export function adminLanding(input: {
  mustChangePassword: boolean;
  requestedNext: string;
  changeRequested: boolean;
}): AdminLanding {
  const next = safeAdminNext(input.requestedNext);
  if (input.mustChangePassword || input.changeRequested) {
    return "password";
  }
  if (next !== null) {
    return { returnTo: next };
  }
  return "settled";
}

export function adminLoginDestination(input: {
  mustChangePassword: boolean;
  requestedNext: string;
}): string {
  const next = safeAdminNext(input.requestedNext);
  if (input.mustChangePassword) {
    return next === null ? "/admin" : `/admin?next=${encodeURIComponent(next)}`;
  }
  return next ?? "/admin";
}

export function adminLoginFailurePath(message: string, requestedNext: string): string {
  const params = new URLSearchParams({ notice: message });
  const next = safeAdminNext(requestedNext);
  if (next !== null) {
    params.set("next", next);
  }
  return `/admin?${params.toString()}`;
}

export function adminPasswordResultPath(input: {
  ok: boolean;
  message: string;
  requestedNext: string;
  changeRequested: boolean;
}): string {
  const next = safeAdminNext(input.requestedNext);
  if (input.ok && next !== null) {
    return next;
  }
  const params = new URLSearchParams({
    notice: input.ok ? "密码已修改。" : input.message,
  });
  if (!input.ok && input.changeRequested) {
    params.set("change", "1");
  }
  if (!input.ok && next !== null) {
    params.set("next", next);
  }
  return `/admin?${params.toString()}`;
}
