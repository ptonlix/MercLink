import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activePhoneAvailable,
  disableMerchantEffects,
  merchantCanApproveAgent,
  merchantCanAuthenticate,
  provisionedMerchant,
  shouldCreateSuperAdmin,
  unknownMerchantMessage,
} from "./accounts";
import {
  isArgon2idHash,
  nextPasswordAccepted,
  passwordIsHashed,
  provisionAllowed,
} from "./password";
import { isLoginPhone, normalizePhone } from "./phone";
import {
  buyerPhoneOutcome,
  canSetPassword,
  captchaParamAccepted,
  emailCanLogin,
  recordWrongSmsCheck,
  smsDailyCap,
  smsMaxWrongChecks,
  smsMinIntervalMs,
  smsSendAllowed,
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

  it("blocks merchant provisioning until the initial password changes", () => {
    expect(provisionAllowed(true)).toEqual({
      ok: false,
      error: "password_change_required",
      message: "请先修改初始密码。",
    });
    expect(provisionAllowed(false)).toEqual({ ok: true });
    expect(nextPasswordAccepted("short")).toMatchObject({ ok: false, error: "validation_error" });
    expect(nextPasswordAccepted("long-enough")).toEqual({ ok: true });
  });
});

describe("admin and merchant accounts", () => {
  it("creates one super-admin and one active merchant", () => {
    expect(shouldCreateSuperAdmin(0)).toBe(true);
    expect(shouldCreateSuperAdmin(1)).toBe(false);
    expect(activePhoneAvailable(true).ok).toBe(false);
    expect(activePhoneAvailable(false)).toEqual({ ok: true });
    expect(provisionedMerchant()).toEqual({ status: "active", mustChangePassword: true });
  });

  it("disables login and approval without deleting the account", () => {
    expect(disableMerchantEffects()).toEqual({
      status: "disabled",
      revokeGrants: true,
      revokeApiKeys: true,
      keepAccount: true,
    });
    expect(merchantCanAuthenticate({ status: "disabled", deletedAt: null })).toBe(false);
    expect(merchantCanAuthenticate({ status: "active", deletedAt: new Date() })).toBe(false);
    expect(merchantCanAuthenticate({ status: "active", deletedAt: null })).toBe(true);
    expect(
      merchantCanApproveAgent({ status: "active", deletedAt: null, mustChangePassword: true }),
    ).toBe(false);
    expect(
      merchantCanApproveAgent({ status: "active", deletedAt: null, mustChangePassword: false }),
    ).toBe(true);
    expect(unknownMerchantMessage).toBe("请联系管理员开通");
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

  it("enforces the 60 second interval and the 24 hour cap", () => {
    const now = new Date("2026-05-16T12:00:00.000Z");
    const recent = new Date(now.getTime() - 30_000);
    expect(smsSendAllowed({ now, sentAt: [recent] })).toMatchObject({
      ok: false,
      error: "sms_rate_limited",
      message: "发送过于频繁，请稍后再试。",
    });
    expect(smsSendAllowed({ now, sentAt: [new Date(now.getTime() - smsMinIntervalMs)] })).toEqual({
      ok: true,
    });

    const sends = Array.from({ length: smsDailyCap }, (_item, index) => {
      return new Date(now.getTime() - smsMinIntervalMs * (index + 1));
    });
    expect(smsSendAllowed({ now, sentAt: sends })).toMatchObject({
      ok: false,
      error: "sms_rate_limited",
      message: "今日发送次数已达上限。",
    });
    expect(smsSendAllowed({ now, sentAt: [] })).toEqual({ ok: true });
    const stale = new Date(now.getTime() - smsWindowMs);
    expect(smsSendAllowed({ now, sentAt: [stale] })).toEqual({ ok: true });
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
    expect(canSetPassword({ smsVerified: false, invalidated: false })).toMatchObject({
      ok: false,
      error: "captcha_required",
    });
    expect(canSetPassword({ smsVerified: true, invalidated: true })).toMatchObject({ ok: false });
    expect(canSetPassword({ smsVerified: true, invalidated: false })).toEqual({ ok: true });
  });
});
