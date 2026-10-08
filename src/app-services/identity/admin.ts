import type { Sql } from "../../db/client";
import { shouldCreateSuperAdmin } from "../../domain/identity/accounts";
import { passwordIsHashed, nextPasswordAccepted } from "../../domain/identity/password";
import { normalizePhone } from "../../domain/identity/phone";
import { createPublicId } from "../../shared/id";
import { hashPassword, verifyPassword } from "./passwords";
import { failure, type Failure } from "./result";

export type AdminRecord = {
  id: string;
  phone: string;
  passwordHash: string;
  mustChangePassword: boolean;
};

export async function ensureSuperAdmin(
  sql: Sql,
  input: { phone: string; password: string },
): Promise<{ created: boolean; admin: AdminRecord }> {
  const phone = normalizePhone(input.phone);
  const existing = await findAdmin(sql);
  if (!shouldCreateSuperAdmin(existing === null ? 0 : 1) && existing !== null) {
    return { created: false, admin: existing };
  }
  const passwordHash = await hashPassword(input.password);
  if (!passwordIsHashed(passwordHash, input.password)) {
    throw new Error("super-admin password was not stored as a hash");
  }
  const admin: AdminRecord = {
    id: createPublicId("admin"),
    phone,
    passwordHash,
    mustChangePassword: true,
  };
  await sql`
    INSERT INTO admins (id, phone, password_hash, must_change_password)
    VALUES (${admin.id}, ${admin.phone}, ${admin.passwordHash}, ${admin.mustChangePassword})
  `;
  return { created: true, admin };
}

export async function findAdmin(sql: Sql): Promise<AdminRecord | null> {
  const rows = await sql<AdminRecord[]>`
    SELECT id, phone, password_hash AS "passwordHash", must_change_password AS "mustChangePassword"
    FROM admins
    WHERE deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function authenticateAdmin(
  sql: Sql,
  input: { phone: string; password: string },
): Promise<{ ok: true; admin: AdminRecord } | Failure> {
  const admin = await findAdmin(sql);
  if (admin === null || admin.phone !== normalizePhone(input.phone)) {
    return failure(401, "unauthorized", "手机号或密码不正确。");
  }
  const matches = await verifyPassword(admin.passwordHash, input.password);
  if (!matches) {
    return failure(401, "unauthorized", "手机号或密码不正确。");
  }
  return { ok: true, admin };
}

export async function changeAdminPassword(
  sql: Sql,
  input: { adminId: string; currentPassword: string; nextPassword: string },
): Promise<{ ok: true } | Failure> {
  const accepted = nextPasswordAccepted(input.nextPassword);
  if (!accepted.ok) {
    return failure(400, accepted.error, accepted.message);
  }
  const admin = await findAdmin(sql);
  if (admin === null || admin.id !== input.adminId) {
    return failure(401, "unauthorized", "请先登录。");
  }
  const matches = await verifyPassword(admin.passwordHash, input.currentPassword);
  if (!matches) {
    return failure(401, "unauthorized", "当前密码不正确。");
  }
  const passwordHash = await hashPassword(input.nextPassword);
  await sql.begin(async (tx) => {
    await tx`
      UPDATE admins
      SET password_hash = ${passwordHash}, must_change_password = false, updated_at = now()
      WHERE id = ${admin.id}
    `;
    await tx`
      UPDATE merchants
      SET password_hash = ${passwordHash}, must_change_password = false, updated_at = now()
      WHERE phone = ${admin.phone} AND deleted_at IS NULL
    `;
  });
  return { ok: true };
}
