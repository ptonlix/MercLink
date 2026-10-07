import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { admins, buyers, merchants } from "../../db/schema/identity";
import { passwordIsHashed } from "../../domain/identity/password";
import { unknownMerchantMessage } from "../../domain/identity/accounts";
import { defaultCatalog, resetDefaultCatalog } from "../../shared/seams/default-catalog";
import { changeAdminPassword, ensureSuperAdmin } from "./admin";
import { withIdentityDatabase } from "./database";
import {
  disableMerchant,
  loginMerchant,
  provisionMerchant,
  resetMerchantPassword,
} from "./merchants";

const phone = "13800138000";
const password = "initial-admin-password";
const next = "changed-admin-password";

afterEach(() => {
  resetDefaultCatalog();
});

describe("identity schema", () => {
  it("stores password hashes and partial unique phone indexes", async () => {
    expect(admins.passwordHash.name).toBe("password_hash");
    expect(merchants.passwordHash.name).toBe("password_hash");
    expect(buyers.passwordHash.name).toBe("password_hash");
    await withIdentityDatabase(async (sql) => {
      const columns = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name = 'password_hash'
          AND table_name IN ('admins', 'merchants', 'buyers')
      `;
      expect(columns.map((row) => row.table_name).sort()).toEqual([
        "admins",
        "buyers",
        "merchants",
      ]);
      const indexes = await sql<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ('merchants_phone_active_uidx', 'buyers_phone_active_uidx')
      `;
      expect(indexes).toHaveLength(2);
      for (const index of indexes) {
        expect(index.indexdef.toLowerCase()).toContain("unique");
        expect(index.indexdef.toLowerCase()).toContain("deleted_at is null");
      }
    });
  });
});

describe("super-admin and merchants", () => {
  it("hashes the initial password and rejects provisioning before it changes", async () => {
    await withIdentityDatabase(async (sql) => {
      const first = await ensureSuperAdmin(sql, { phone, password });
      const second = await ensureSuperAdmin(sql, {
        phone: "13900139000",
        password: "other-admin-password",
      });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.admin.id).toBe(first.admin.id);
      expect(passwordIsHashed(first.admin.passwordHash, password)).toBe(true);
      const blocked = await provisionMerchant(sql, {
        adminId: first.admin.id,
        name: "南风铺",
        phone: "13700137000",
        password: "merchant-password",
      });
      expect(blocked).toMatchObject({ ok: false, status: 403, error: "password_change_required" });
    });
  });

  it("provisions one merchant, requests the default catalog, and rejects a duplicate phone", async () => {
    await withIdentityDatabase(async (sql) => {
      const admin = await changedAdmin(sql);
      const calls: { merchantId: string; tx: object }[] = [];
      defaultCatalog.register((input) => {
        calls.push(input);
        return Promise.resolve({ status: "created", catalogId: "cat_test" });
      });
      const created = await provisionMerchant(sql, {
        adminId: admin.id,
        name: "南风铺",
        phone: "13700137000",
        password: "merchant-password",
      });
      expect(created).toMatchObject({ ok: true, default_catalog: "created" });
      expect(calls).toHaveLength(1);
      if (created.ok) {
        expect(calls[0]?.merchantId).toBe(created.merchantId);
      }
      const duplicate = await provisionMerchant(sql, {
        adminId: admin.id,
        name: "另一家",
        phone: "13700137000",
        password: "merchant-password",
      });
      expect(duplicate).toMatchObject({ ok: false, error: "conflict" });
      const count = await sql<{ count: string }[]>`SELECT count(*) FROM merchants`;
      expect(count[0]?.count).toBe("1");
    });
  });

  it("still provisions when the default catalog seam is unregistered", async () => {
    await withIdentityDatabase(async (sql) => {
      resetDefaultCatalog();
      const admin = await changedAdmin(sql);
      const created = await provisionMerchant(sql, {
        adminId: admin.id,
        name: "北窗",
        phone: "13600136000",
        password: "merchant-password",
      });
      expect(created).toMatchObject({ ok: true, default_catalog: "pending" });
      const rows = await sql<{ status: string; must_change_password: boolean }[]>`
        SELECT status, must_change_password FROM merchants
      `;
      expect(rows[0]).toEqual({ status: "active", must_change_password: true });
    });
  });

  it("disables the merchant, revokes grants and keys, and rejects login", async () => {
    await withIdentityDatabase(async (sql) => {
      const admin = await changedAdmin(sql);
      const created = await provisionMerchant(sql, {
        adminId: admin.id,
        name: "南风铺",
        phone: "13700137000",
        password: "merchant-password",
      });
      if (!created.ok) {
        throw new Error("provision failed");
      }
      await sql`
        INSERT INTO oauth_grants (id, owner_type, owner_id, client_name, scopes, refresh_hash)
        VALUES ('grn_test', 'merchant', ${created.merchantId}, 'agent', ARRAY['product:read'], 'hash')
      `;
      await sql`
        INSERT INTO api_keys (id, owner_type, owner_id, prefix, hash, scopes)
        VALUES ('key_test', 'merchant', ${created.merchantId}, 'key_test', 'hash', ARRAY['product:read'])
      `;
      expect(await disableMerchant(sql, created.merchantId)).toEqual({ ok: true });
      const grants = await sql<{ revoked_at: Date | null }[]>`SELECT revoked_at FROM oauth_grants`;
      const keys = await sql<{ revoked_at: Date | null }[]>`SELECT revoked_at FROM api_keys`;
      expect(grants[0]?.revoked_at).toBeInstanceOf(Date);
      expect(keys[0]?.revoked_at).toBeInstanceOf(Date);
      const login = await loginMerchant(sql, {
        phone: "13700137000",
        password: "merchant-password",
      });
      expect(login.ok).toBe(false);
      const kept = await sql<{ id: string }[]>`SELECT id FROM merchants`;
      expect(kept).toHaveLength(1);
    });
  });

  it("tells an unknown phone to contact an administrator", async () => {
    await withIdentityDatabase(async (sql) => {
      const login = await loginMerchant(sql, {
        phone: "13700137000",
        password: "merchant-password",
      });
      expect(login).toMatchObject({ ok: false, message: unknownMerchantMessage });
      const count = await sql<{ count: string }[]>`SELECT count(*) FROM merchants`;
      expect(count[0]?.count).toBe("0");
    });
  });

  it("resets a merchant password and requires another change", async () => {
    await withIdentityDatabase(async (sql) => {
      const admin = await changedAdmin(sql);
      const created = await provisionMerchant(sql, {
        adminId: admin.id,
        name: "南风铺",
        phone: "13700137000",
        password: "merchant-password",
      });
      if (!created.ok) {
        throw new Error("provision failed");
      }
      expect(
        await resetMerchantPassword(sql, {
          merchantId: created.merchantId,
          password: "reset-password",
        }),
      ).toEqual({
        ok: true,
      });
      const rows = await sql<{ must_change_password: boolean; password_hash: string }[]>`
        SELECT must_change_password, password_hash FROM merchants WHERE id = ${created.merchantId}
      `;
      expect(rows[0]?.must_change_password).toBe(true);
      expect(passwordIsHashed(rows[0]?.password_hash ?? "", "reset-password")).toBe(true);
    });
  });
});

describe("slice boundaries", () => {
  it("records official SDK names that the composed manifest installs", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const slice = JSON.parse(await readFile("src/identity/slice-deps.json", "utf8")) as {
      packages: string[];
    };
    expect(slice.packages).toEqual([
      "@alicloud/captcha20230305",
      "@alicloud/dypnsapi20170525",
      "@alicloud/openapi-core",
    ]);
    for (const name of slice.packages) {
      expect(manifest.dependencies ?? {}).toHaveProperty(name);
    }
  });
});

async function changedAdmin(sql: Parameters<typeof ensureSuperAdmin>[0]) {
  const created = await ensureSuperAdmin(sql, { phone, password });
  const changed = await changeAdminPassword(sql, {
    adminId: created.admin.id,
    currentPassword: password,
    nextPassword: next,
  });
  expect(changed).toEqual({ ok: true });
  return created.admin;
}
