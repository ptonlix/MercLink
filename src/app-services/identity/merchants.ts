import type { Sql } from "../../db/client";
import {
  merchantCanApproveAgent,
  merchantCanAuthenticate,
  provisionedMerchant,
  shouldCreateStoreMerchant,
  singleStoreMessage,
  storeMerchantName,
  unknownMerchantMessage,
  type MerchantStatus,
} from "../../domain/identity/accounts";
import { nextPasswordAccepted, passwordIsHashed } from "../../domain/identity/password";
import { normalizePhone } from "../../domain/identity/phone";
import { createPublicId } from "../../shared/id";
import { defaultCatalog } from "../../shared/seams/default-catalog";
import { findAdmin, type AdminRecord } from "./admin";
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
  default_catalog: "pending" | "created" | "existing";
};

export async function ensureStoreMerchant(
  sql: Sql,
  admin: AdminRecord,
): Promise<ProvisionResult & { created: boolean }> {
  const operator = await findAdmin(sql);
  if (operator === null || operator.id !== admin.id) {
    throw new Error("store merchant requires the super-admin");
  }
  const existing = await listStoreMerchants(sql);
  if (!shouldCreateStoreMerchant(existing.length)) {
    return existingStore(existing);
  }
  if (!passwordIsHashed(operator.passwordHash, operator.phone)) {
    throw new Error("store merchant password was not stored as a hash");
  }
  const merchantId = createPublicId("merchant");
  const created = provisionedMerchant();
  try {
    const catalog = await sql.begin(async (tx) => {
      await tx`
        INSERT INTO merchants (
          id, name, phone, password_hash, status, created_by, must_change_password
        ) VALUES (
          ${merchantId}, ${storeMerchantName}, ${operator.phone}, ${operator.passwordHash},
          ${created.status}, ${operator.id}, ${operator.mustChangePassword}
        )
      `;
      return defaultCatalog.create({ merchantId, tx });
    });
    return {
      ok: true,
      created: true,
      merchantId,
      default_catalog: catalog.status === "created" ? "created" : "pending",
    };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      return existingStore(await listStoreMerchants(sql));
    }
    throw error;
  }
}

function existingStore(existing: readonly MerchantRecord[]): ProvisionResult & { created: false } {
  if (existing.length !== 1) {
    throw new Error(singleStoreMessage);
  }
  const store = existing[0];
  if (store === undefined) {
    throw new Error(singleStoreMessage);
  }
  return { ok: true, created: false, merchantId: store.id, default_catalog: "existing" };
}

export function unknownMerchantCopy(): string {
  return unknownMerchantMessage;
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
  await sql.begin(async (tx) => {
    await tx`
      UPDATE merchants
      SET password_hash = ${passwordHash}, must_change_password = false, updated_at = now()
      WHERE id = ${merchant.id}
    `;
    await tx`
      UPDATE admins
      SET password_hash = ${passwordHash}, must_change_password = false, updated_at = now()
      WHERE phone = ${merchant.phone} AND deleted_at IS NULL
    `;
  });
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

async function listStoreMerchants(sql: Sql): Promise<MerchantRecord[]> {
  return sql<MerchantRecord[]>`
    SELECT id, name, phone, status, must_change_password AS "mustChangePassword",
           deleted_at AS "deletedAt", password_hash AS "passwordHash"
    FROM merchants
    WHERE deleted_at IS NULL
    ORDER BY created_at
  `;
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
