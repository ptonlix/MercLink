import type { Sql } from "../../db/client";
import {
  activePhoneAvailable,
  merchantCanApproveAgent,
  merchantCanAuthenticate,
  provisionedMerchant,
  unknownMerchantMessage,
  type MerchantStatus,
} from "../../domain/identity/accounts";
import { nextPasswordAccepted, passwordIsHashed } from "../../domain/identity/password";
import { isLoginPhone, normalizePhone } from "../../domain/identity/phone";
import { createPublicId } from "../../shared/id";
import { defaultCatalog } from "../../shared/seams/default-catalog";
import { assertAdminCanProvision, findAdmin } from "./admin";
import { hashPassword, verifyPassword } from "./passwords";
import { failure, isUniqueViolation, type Failure } from "./result";

export type MerchantRecord = {
  id: string;
  name: string;
  phone: string;
  status: MerchantStatus;
  mustChangePassword: boolean;
  deletedAt: Date | null;
  passwordHash: string;
};

export type ProvisionResult = {
  ok: true;
  merchantId: string;
  default_catalog: "pending" | "created";
};

export async function provisionMerchant(
  sql: Sql,
  input: { adminId: string; name: string; phone: string; password: string },
): Promise<ProvisionResult | Failure> {
  const admin = await findAdmin(sql);
  if (admin === null || admin.id !== input.adminId) {
    return failure(401, "unauthorized", "请先登录。");
  }
  const allowed = assertAdminCanProvision(admin);
  if (!allowed.ok) {
    return allowed;
  }
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (name.length === 0 || !isLoginPhone(phone)) {
    return failure(400, "validation_error", "请填写商家名称和手机号。");
  }
  const passwordDecision = nextPasswordAccepted(input.password);
  if (!passwordDecision.ok) {
    return failure(400, passwordDecision.error, passwordDecision.message);
  }
  const active = await findActiveMerchantByPhone(sql, phone);
  const available = activePhoneAvailable(active !== null);
  if (!available.ok) {
    return failure(409, "conflict", available.message);
  }
  const passwordHash = await hashPassword(input.password);
  if (!passwordIsHashed(passwordHash, input.password)) {
    throw new Error("merchant password was not stored as a hash");
  }
  const merchantId = createPublicId("merchant");
  const created = provisionedMerchant();
  try {
    const catalog = await sql.begin(async (tx) => {
      await tx`
        INSERT INTO merchants (
          id, name, phone, password_hash, status, created_by, must_change_password
        ) VALUES (
          ${merchantId}, ${name}, ${phone}, ${passwordHash}, ${created.status},
          ${admin.id}, ${created.mustChangePassword}
        )
      `;
      return defaultCatalog.create({ merchantId, tx });
    });
    return {
      ok: true,
      merchantId,
      default_catalog: catalog.status === "created" ? "created" : "pending",
    };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return failure(409, "conflict", "该手机号已开通。");
    }
    throw error;
  }
}

export async function disableMerchant(
  sql: Sql,
  merchantId: string,
): Promise<{ ok: true } | Failure> {
  const merchant = await findMerchant(sql, merchantId);
  if (merchant === null) {
    return failure(404, "not_found", "商家不存在。");
  }
  await sql.begin(async (tx) => {
    await tx`
      UPDATE merchants SET status = 'disabled', updated_at = now() WHERE id = ${merchantId}
    `;
    await tx`
      UPDATE oauth_grants
      SET revoked_at = now(), updated_at = now()
      WHERE owner_type = 'merchant' AND owner_id = ${merchantId} AND revoked_at IS NULL
    `;
    await tx`
      UPDATE api_keys
      SET revoked_at = now(), updated_at = now()
      WHERE owner_type = 'merchant' AND owner_id = ${merchantId} AND revoked_at IS NULL
    `;
    await tx`DELETE FROM oidc_records WHERE grant_id IN (
      SELECT id FROM oauth_grants WHERE owner_type = 'merchant' AND owner_id = ${merchantId}
    )`;
  });
  return { ok: true };
}

export async function resetMerchantPassword(
  sql: Sql,
  input: { merchantId: string; password: string },
): Promise<{ ok: true } | Failure> {
  const accepted = nextPasswordAccepted(input.password);
  if (!accepted.ok) {
    return failure(400, accepted.error, accepted.message);
  }
  const merchant = await findMerchant(sql, input.merchantId);
  if (merchant === null) {
    return failure(404, "not_found", "商家不存在。");
  }
  const passwordHash = await hashPassword(input.password);
  await sql`
    UPDATE merchants
    SET password_hash = ${passwordHash}, must_change_password = true, updated_at = now()
    WHERE id = ${merchant.id}
  `;
  return { ok: true };
}

export async function loginMerchant(
  sql: Sql,
  input: { phone: string; password: string },
): Promise<{ ok: true; merchant: MerchantRecord } | Failure> {
  const phone = normalizePhone(input.phone);
  const merchant = await findActiveMerchantByPhone(sql, phone);
  if (merchant === null || !merchantCanAuthenticate(merchant)) {
    const any = await findMerchantByPhone(sql, phone);
    if (any !== null && any.status === "disabled") {
      return failure(403, "forbidden", "账号已停用。");
    }
    return failure(404, "not_found", unknownMerchantMessage);
  }
  const matches = await verifyPassword(merchant.passwordHash, input.password);
  if (!matches) {
    return failure(401, "unauthorized", "手机号或密码不正确。");
  }
  return { ok: true, merchant };
}

export async function changeMerchantPassword(
  sql: Sql,
  input: { merchantId: string; currentPassword: string; nextPassword: string },
): Promise<{ ok: true; merchant: MerchantRecord } | Failure> {
  const accepted = nextPasswordAccepted(input.nextPassword);
  if (!accepted.ok) {
    return failure(400, accepted.error, accepted.message);
  }
  const merchant = await findMerchant(sql, input.merchantId);
  if (merchant === null || !merchantCanAuthenticate(merchant)) {
    return failure(403, "forbidden", "账号已停用。");
  }
  const matches = await verifyPassword(merchant.passwordHash, input.currentPassword);
  if (!matches) {
    return failure(401, "unauthorized", "当前密码不正确。");
  }
  const passwordHash = await hashPassword(input.nextPassword);
  await sql`
    UPDATE merchants
    SET password_hash = ${passwordHash}, must_change_password = false, updated_at = now()
    WHERE id = ${merchant.id}
  `;
  const updated = await findMerchant(sql, merchant.id);
  if (updated === null) {
    return failure(404, "not_found", "商家不存在。");
  }
  return { ok: true, merchant: updated };
}

export function merchantApprovalAllowed(merchant: MerchantRecord): { ok: true } | Failure {
  if (!merchantCanApproveAgent(merchant)) {
    if (merchant.mustChangePassword) {
      return failure(403, "password_change_required", "请先修改初始密码。");
    }
    return failure(403, "forbidden", "账号已停用。");
  }
  return { ok: true };
}

export async function findMerchant(sql: Sql, merchantId: string): Promise<MerchantRecord | null> {
  const rows = await sql<MerchantRecord[]>`
    SELECT id, name, phone, status, must_change_password AS "mustChangePassword",
           deleted_at AS "deletedAt", password_hash AS "passwordHash"
    FROM merchants
    WHERE id = ${merchantId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function findMerchantByPhone(sql: Sql, phone: string): Promise<MerchantRecord | null> {
  const rows = await sql<MerchantRecord[]>`
    SELECT id, name, phone, status, must_change_password AS "mustChangePassword",
           deleted_at AS "deletedAt", password_hash AS "passwordHash"
    FROM merchants
    WHERE phone = ${phone} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function findActiveMerchantByPhone(sql: Sql, phone: string): Promise<MerchantRecord | null> {
  const merchant = await findMerchantByPhone(sql, phone);
  if (merchant === null || merchant.status !== "active") {
    return null;
  }
  return merchant;
}
