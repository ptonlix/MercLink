import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminLanding,
  adminLoginDestination,
  adminLoginFailurePath,
  adminPasswordResultPath,
  merchantCanApproveAgent,
  merchantCanAuthenticate,
  provisionedMerchant,
  safeAdminNext,
  shouldCreateStoreMerchant,
  shouldCreateSuperAdmin,
  unknownMerchantMessage,
} from "./accounts";
import { isArgon2idHash, nextPasswordAccepted, passwordIsHashed } from "./password";
import { isLoginPhone, normalizePhone } from "./phone";
import { deviceCodeTtlSeconds } from "../access/tokens";
import {
  buyerPhoneOutcome,
  canSetPassword,
  captchaParamAccepted,
  emailCanLogin,
  recordWrongSmsCheck,
  registrationChallengeExpired,
  registrationChallengeTtlMs,
  smsDailyCap,
  smsMaxWrongChecks,
  smsMinIntervalMs,
  smsRateLimitPolicies,
  smsSendLimited,
  smsSendPolicyNames,
  smsWindowMs,
} from "./registration";

describe("phones and passwords", () => {
  it("accepts a mainland mobile and rejects email-shaped input", () => {
    expect(normalizePhone("138 0013-8000")).toBe("13800138000");
    expect(isLoginPhone("13800138000")).toBe(true);
    expect(isLoginPhone("buyer@example.com")).toBe(false);
    expect(isLoginPhone("23800138000")).toBe(false);
  });

  it("recognizes only argon2id hashes", () => {
    expect(isArgon2idHash("$argon2id$v=19$m=1,t=1,p=1$salt$hash")).toBe(true);
    expect(isArgon2idHash("$argon2i$v=19$m=1,t=1,p=1$salt$hash")).toBe(false);
    expect(passwordIsHashed("$argon2id$stored", "plain-secret")).toBe(true);
    expect(passwordIsHashed("plain-secret", "plain-secret")).toBe(false);
  });

  it("rejects a short next password", () => {
    expect(nextPasswordAccepted("short")).toMatchObject({ ok: false, error: "validation_error" });
    expect(nextPasswordAccepted("long-enough")).toEqual({ ok: true });
  });
});

describe("admin and merchant accounts", () => {
  it("creates one super-admin and one active merchant", () => {
    expect(shouldCreateSuperAdmin(0)).toBe(true);
    expect(shouldCreateSuperAdmin(1)).toBe(false);
    expect(provisionedMerchant()).toEqual({ status: "active", mustChangePassword: true });
  });

  it("disables login and approval without deleting the account", () => {
    expect(merchantCanAuthenticate({ status: "disabled", deletedAt: null })).toBe(false);
    expect(merchantCanAuthenticate({ status: "active", deletedAt: new Date() })).toBe(false);
    expect(merchantCanAuthenticate({ status: "active", deletedAt: null })).toBe(true);
    expect(
      merchantCanApproveAgent({ status: "active", deletedAt: null, mustChangePassword: true }),
    ).toBe(false);
    expect(
      merchantCanApproveAgent({ status: "active", deletedAt: null, mustChangePassword: false }),
    ).toBe(true);
    expect(unknownMerchantMessage).toBe("请使用店主手机号登录。");
    expect(shouldCreateStoreMerchant(0)).toBe(true);
    expect(shouldCreateStoreMerchant(1)).toBe(false);
  });

  it("does not reopen the password page after the password changed", () => {
    const next = "/admin/storefront-resets/srr_ocpUAFTCVrJBMijKiAUrWQ";
    expect(safeAdminNext(next)).toBe(next);
    expect(safeAdminNext("https://evil.example/admin/x")).toBeNull();
    expect(safeAdminNext("//evil.example/admin/x")).toBeNull();
    expect(safeAdminNext("/admin/../secret")).toBeNull();
    expect(adminLoginDestination({ mustChangePassword: false, requestedNext: next })).toBe(next);
    expect(adminLoginDestination({ mustChangePassword: false, requestedNext: "" })).toBe("/admin");
    expect(adminLoginDestination({ mustChangePassword: true, requestedNext: next })).toBe(
      `/admin?next=${encodeURIComponent(next)}`,
    );
    expect(
      adminLanding({
        mustChangePassword: false,
        requestedNext: "",
        changeRequested: false,
      }),
    ).toBe("settled");
    expect(
      adminLanding({
        mustChangePassword: false,
        requestedNext: next,
        changeRequested: true,
      }),
    ).toBe("password");
    expect(adminLoginFailurePath("手机号或密码不正确。", next)).toContain("next=");
    expect(
      adminPasswordResultPath({
        ok: true,
        message: "",
        requestedNext: next,
        changeRequested: true,
      }),
    ).toBe(next);
  });

  it("does not keep a second-store provision, disable, or password-copy path", async () => {
    const source = await readFile("src/app-services/identity/merchants.ts", "utf8");
    expect(source).not.toContain("disableMerchant");
    expect(source).not.toContain("resetMerchantPassword");
    expect(source).not.toContain("alignStoreMerchant");
    expect(source).not.toContain("revokeMerchantAccess");
    expect(source).not.toContain("oauth_grants");
    expect(source).not.toContain("api_keys");
    expect(source).not.toContain("oidc_records");
  });
});

describe("buyer registration rules", () => {
  it("rejects a missing or reused captcha parameter", () => {
    expect(captchaParamAccepted("  ", [])).toMatchObject({ ok: false, error: "captcha_required" });
    expect(captchaParamAccepted("param-1", ["param-1"])).toMatchObject({
      ok: false,
      error: "captcha_required",
    });
    expect(captchaParamAccepted("param-1", [])).toEqual({ ok: true });
  });

  it("locks the live SMS rate-limit policies and messages", async () => {
    expect(smsRateLimitPolicies()).toEqual({
      [smsSendPolicyNames.interval]: { limit: 1, windowMs: smsMinIntervalMs },
      [smsSendPolicyNames.daily]: { limit: smsDailyCap, windowMs: smsWindowMs },
    });
    expect(smsSendLimited("interval")).toEqual({
      ok: false,
      error: "sms_rate_limited",
      message: "发送过于频繁，请稍后再试。",
    });
    expect(smsSendLimited("daily")).toEqual({
      ok: false,
      error: "sms_rate_limited",
      message: "今日发送次数已达上限。",
    });
    const buyers = await readFile("src/app-services/identity/buyers.ts", "utf8");
    const runtime = await readFile("src/app-services/identity/runtime.ts", "utf8");
    expect(buyers).toContain("smsSendLimited");
    expect(buyers).toContain("smsSendPolicyNames");
    expect(runtime).toContain("smsRateLimitPolicies");
    expect(buyers).not.toContain("smsSendAllowed");
    expect(runtime).not.toContain("smsSendAllowed");
    expect(await readFile("src/domain/identity/registration.ts", "utf8")).not.toContain(
      "smsSendAllowed",
    );
  });

  it("does not import the Redis client", async () => {
    const directory = path.join(process.cwd(), "src/domain/identity");
    const files = await readdir(directory);
    for (const file of files) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
        continue;
      }
      const source = await readFile(path.join(directory, file), "utf8");
      expect(source).not.toMatch(/from ["']redis["']|adapters\/redis/);
    }
  });

  it("turns an existing phone into login and ignores email", () => {
    expect(buyerPhoneOutcome(true)).toBe("login");
    expect(buyerPhoneOutcome(false)).toBe("register");
    expect(emailCanLogin()).toBe(false);
  });

  it("invalidates the challenge after repeated wrong checks", () => {
    expect(recordWrongSmsCheck(smsMaxWrongChecks - 2)).toEqual({
      wrongChecks: smsMaxWrongChecks - 1,
      invalidated: false,
    });
    expect(recordWrongSmsCheck(smsMaxWrongChecks - 1)).toEqual({
      wrongChecks: smsMaxWrongChecks,
      invalidated: true,
    });
    const now = new Date("2026-05-16T00:10:00.000Z");
    const fresh = new Date(now.getTime() - 1_000);
    expect(
      canSetPassword({ smsVerified: false, invalidated: false, createdAt: fresh, now }),
    ).toMatchObject({
      ok: false,
      error: "captcha_required",
    });
    expect(
      canSetPassword({ smsVerified: true, invalidated: true, createdAt: fresh, now }),
    ).toMatchObject({ ok: false });
    expect(
      canSetPassword({ smsVerified: true, invalidated: false, createdAt: fresh, now }),
    ).toEqual({
      ok: true,
    });
    const expiredAt = new Date(now.getTime() - registrationChallengeTtlMs);
    expect(
      canSetPassword({ smsVerified: true, invalidated: false, createdAt: expiredAt, now }),
    ).toMatchObject({ ok: false, error: "captcha_required" });
    expect(registrationChallengeTtlMs).toBe(deviceCodeTtlSeconds * 1000);
    expect(registrationChallengeExpired(fresh, now)).toBe(false);
    expect(registrationChallengeExpired(expiredAt, now)).toBe(true);
  });
});
