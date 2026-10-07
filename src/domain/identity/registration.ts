export const smsMinIntervalMs = 60_000;
export const smsWindowMs = 24 * 60 * 60 * 1000;
export const smsDailyCap = 10;
export const smsMaxWrongChecks = 5;
export const smsSendPolicyNames = {
  interval: "sms-send:60s",
  daily: "sms-send:24h",
} as const;

type RegistrationError = "captcha_required" | "sms_rate_limited" | "validation_error";

export type RegistrationDecision =
  { ok: true } | { ok: false; error: RegistrationError; message: string };

export function captchaParamAccepted(
  param: string,
  usedParams: readonly string[],
): RegistrationDecision {
  const trimmed = param.trim();
  if (trimmed.length === 0 || usedParams.includes(trimmed)) {
    return { ok: false, error: "captcha_required", message: "请完成人机验证。" };
  }
  return { ok: true };
}

export function smsRateLimitPolicies(): {
  readonly [smsSendPolicyNames.interval]: { limit: number; windowMs: number };
  readonly [smsSendPolicyNames.daily]: { limit: number; windowMs: number };
} {
  return {
    [smsSendPolicyNames.interval]: { limit: 1, windowMs: smsMinIntervalMs },
    [smsSendPolicyNames.daily]: { limit: smsDailyCap, windowMs: smsWindowMs },
  };
}

export function smsSendLimited(reason: "interval" | "daily"): {
  ok: false;
  error: "sms_rate_limited";
  message: string;
} {
  if (reason === "interval") {
    return { ok: false, error: "sms_rate_limited", message: "发送过于频繁，请稍后再试。" };
  }
  return { ok: false, error: "sms_rate_limited", message: "今日发送次数已达上限。" };
}

export function buyerPhoneOutcome(activeBuyerExists: boolean): "login" | "register" {
  return activeBuyerExists ? "login" : "register";
}

export function emailCanLogin(): false {
  return false;
}

export function recordWrongSmsCheck(currentWrongChecks: number): {
  wrongChecks: number;
  invalidated: boolean;
} {
  const wrongChecks = currentWrongChecks + 1;
  return { wrongChecks, invalidated: wrongChecks >= smsMaxWrongChecks };
}

export function canSetPassword(input: {
  smsVerified: boolean;
  invalidated: boolean;
}): RegistrationDecision {
  if (input.invalidated || !input.smsVerified) {
    return { ok: false, error: "captcha_required", message: "请重新完成验证。" };
  }
  return { ok: true };
}
