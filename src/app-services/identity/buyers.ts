import type { Sql } from "../../db/client";
import {
  buyerPhoneOutcome,
  canSetPassword,
  captchaParamAccepted,
  recordWrongSmsCheck,
  smsSendLimited,
  smsSendPolicyNames,
} from "../../domain/identity/registration";
import { nextPasswordAccepted, passwordIsHashed } from "../../domain/identity/password";
import { isLoginPhone, normalizePhone } from "../../domain/identity/phone";
import { tokenHash } from "../../shared/token-hash";
import type { Clock } from "../../ports/clock";
import type { CaptchaPort } from "../../ports/captcha";
import type { RateLimitPort } from "../../ports/rate-limit";
import type { SmsPort } from "../../ports/sms";
import { createPublicId } from "../../shared/id";
import { hashPassword, verifyPassword } from "./passwords";
import { failure, isUniqueViolation, type Failure } from "./result";

export type BuyerRecord = {
  id: string;
  phone: string;
  email: string | null;
  passwordHash: string;
};

const smsUnavailable = "短信服务暂不可用。";

export type BuyerFlow = {
  sql: Sql;
  clock: Clock;
  captcha: CaptchaPort;
  sms: SmsPort;
  rateLimit: RateLimitPort;
};

function beginBuyerPhone(activeBuyerExists: boolean): "login" | "register" {
  return buyerPhoneOutcome(activeBuyerExists);
}

export async function requestBuyerSms(
  flow: BuyerFlow,
  input: { phone: string; captchaVerifyParam: string },
): Promise<{ ok: true; mode: "login" | "register" } | Failure> {
  const phone = normalizePhone(input.phone);
  if (!isLoginPhone(phone)) {
    return failure(400, "validation_error", "请填写手机号。");
  }
  const captchaHash = tokenHash(input.captchaVerifyParam.trim());
  const used = await flow.sql<{ captcha_hash: string }[]>`
    SELECT captcha_hash FROM used_captcha_params WHERE captcha_hash = ${captchaHash}
  `;
  const accepted = captchaParamAccepted(
    input.captchaVerifyParam,
    used.length > 0 ? [input.captchaVerifyParam.trim()] : [],
  );
  if (!accepted.ok) {
    return failure(400, accepted.error, accepted.message);
  }
  const verified = await flow.captcha.verify({ captchaVerifyParam: input.captchaVerifyParam });
  if (!verified.ok) {
    return failure(400, "captcha_required", verified.message);
  }
  await flow.sql`
    INSERT INTO used_captcha_params (captcha_hash) VALUES (${captchaHash})
    ON CONFLICT (captcha_hash) DO NOTHING
  `;
  const reserved = await flow.rateLimit.reserve({
    subject: phone,
    policies: [smsSendPolicyNames.interval, smsSendPolicyNames.daily],
    now: flow.clock.now(),
  });
  if (!reserved.ok) {
    if (reserved.error === "unavailable") {
      return failure(503, "dependency_unavailable", smsUnavailable);
    }
    return smsLimited(reserved.policy);
  }
  const sent = await flow.sms.sendCode({ phone });
  if (!sent.ok) {
    await flow.rateLimit.release(reserved.reservation);
    return failure(503, "dependency_unavailable", sent.message);
  }
  await flow.sql`
    INSERT INTO registration_challenges (id, phone, captcha_hash)
    VALUES (${createPublicId("challenge")}, ${phone}, ${captchaHash})
  `;
  const existing = await findActiveBuyerByPhone(flow.sql, phone);
  return { ok: true, mode: beginBuyerPhone(existing !== null) };
}

export async function checkBuyerSms(
  flow: BuyerFlow,
  input: { phone: string; code: string },
): Promise<{ ok: true; mode: "login" | "register" } | Failure> {
  const phone = normalizePhone(input.phone);
  const challenge = await latestChallenge(flow.sql, phone);
  if (challenge === null || challenge.invalidatedAt !== null) {
    return failure(400, "captcha_required", "请重新完成验证。");
  }
  const checked = await flow.sms.checkCode({ phone, code: input.code });
  if (!checked.ok) {
    const next = recordWrongSmsCheck(challenge.wrongChecks);
    await flow.sql`
      UPDATE registration_challenges
      SET wrong_checks = ${next.wrongChecks},
          invalidated_at = ${next.invalidated ? flow.clock.now() : null}
      WHERE id = ${challenge.id}
    `;
    if (next.invalidated) {
      return failure(400, "captcha_required", "验证次数已用尽，请重新完成人机验证。");
    }
    return failure(400, "validation_error", checked.message);
  }
  await flow.sql`
    UPDATE registration_challenges
    SET sms_verified_at = ${flow.clock.now()}
    WHERE id = ${challenge.id}
  `;
  const existing = await findActiveBuyerByPhone(flow.sql, phone);
  return { ok: true, mode: beginBuyerPhone(existing !== null) };
}

export async function completeBuyerRegistration(
  flow: BuyerFlow,
  input: { phone: string; password: string; email?: string | null },
): Promise<{ ok: true; buyerId: string; created: boolean; mode: "login" | "register" } | Failure> {
  const phone = normalizePhone(input.phone);
  const challenge = await latestChallenge(flow.sql, phone);
  if (challenge === null) {
    return failure(400, "captcha_required", "请重新完成验证。");
  }
  const ready = canSetPassword({
    smsVerified: challenge.smsVerifiedAt !== null,
    invalidated: challenge.invalidatedAt !== null,
  });
  if (!ready.ok) {
    return failure(400, ready.error, ready.message);
  }
  const passwordDecision = nextPasswordAccepted(input.password);
  if (!passwordDecision.ok) {
    return failure(400, passwordDecision.error, passwordDecision.message);
  }
  const existing = await findActiveBuyerByPhone(flow.sql, phone);
  if (existing !== null) {
    return { ok: true, buyerId: existing.id, created: false, mode: "login" };
  }
  const passwordHash = await hashPassword(input.password);
  if (!passwordIsHashed(passwordHash, input.password)) {
    throw new Error("buyer password was not stored as a hash");
  }
  const email = input.email?.trim() ?? "";
  const buyerId = createPublicId("buyer");
  try {
    await flow.sql`
      INSERT INTO buyers (id, phone, email, password_hash, phone_verified_at)
      VALUES (
        ${buyerId}, ${phone}, ${email.length > 0 ? email : null}, ${passwordHash}, ${flow.clock.now()}
      )
    `;
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      const raced = await findActiveBuyerByPhone(flow.sql, phone);
      if (raced !== null) {
        return { ok: true, buyerId: raced.id, created: false, mode: "login" };
      }
    }
    throw error;
  }
  return { ok: true, buyerId, created: true, mode: "register" };
}

function smsLimited(policy: string): Failure {
  if (policy === smsSendPolicyNames.interval) {
    const decision = smsSendLimited("interval");
    return failure(429, decision.error, decision.message);
  }
  if (policy === smsSendPolicyNames.daily) {
    const decision = smsSendLimited("daily");
    return failure(429, decision.error, decision.message);
  }
  return failure(503, "dependency_unavailable", smsUnavailable);
}

export async function loginBuyerWithPassword(
  flow: BuyerFlow,
  input: { phone: string; password: string },
): Promise<{ ok: true; buyer: BuyerRecord } | Failure> {
  const buyer = await findActiveBuyerByPhone(flow.sql, normalizePhone(input.phone));
  if (buyer === null) {
    return failure(401, "unauthorized", "手机号或密码不正确。");
  }
  const matches = await verifyPassword(buyer.passwordHash, input.password);
  if (!matches) {
    return failure(401, "unauthorized", "手机号或密码不正确。");
  }
  return { ok: true, buyer };
}

export function findBuyerByEmail(): Promise<null> {
  return Promise.resolve(null);
}

async function findActiveBuyerByPhone(sql: Sql, phone: string): Promise<BuyerRecord | null> {
  const rows = await sql<BuyerRecord[]>`
    SELECT id, phone, email, password_hash AS "passwordHash"
    FROM buyers
    WHERE phone = ${normalizePhone(phone)} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

type ChallengeRow = {
  id: string;
  wrongChecks: number;
  smsVerifiedAt: Date | null;
  invalidatedAt: Date | null;
};

async function latestChallenge(sql: Sql, phone: string): Promise<ChallengeRow | null> {
  const rows = await sql<ChallengeRow[]>`
    SELECT id, wrong_checks AS "wrongChecks", sms_verified_at AS "smsVerifiedAt",
           invalidated_at AS "invalidatedAt"
    FROM registration_challenges
    WHERE phone = ${phone}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
