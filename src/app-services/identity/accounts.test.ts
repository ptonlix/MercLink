import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { admins, buyers, merchants } from "../../db/schema/identity";
import { passwordIsHashed } from "../../domain/identity/password";
import { unknownMerchantMessage } from "../../domain/identity/accounts";
import { defaultCatalog, resetDefaultCatalog } from "../../shared/seams/default-catalog";
import { changeAdminPassword, ensureSuperAdmin } from "./admin";
import { withIdentityDatabase } from "./database";
import { ensureStoreMerchant, loginMerchant } from "./merchants";

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
  it("hashes the initial password and creates the store before the password changes", async () => {
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
      const store = await ensureStoreMerchant(sql, first.admin);
      expect(store).toMatchObject({ ok: true, created: true, default_catalog: "pending" });
      const again = await ensureStoreMerchant(sql, first.admin);
      expect(again).toMatchObject({ ok: true, created: false, merchantId: store.merchantId });
      await sql`UPDATE merchants SET password_hash = 'kept-hash' WHERE id = ${store.merchantId}`;
      await ensureStoreMerchant(sql, first.admin);
      const rows = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM merchants WHERE id = ${store.merchantId}
      `;
      expect(rows[0]?.password_hash).toBe("kept-hash");
    });
  });

  it("creates one store with the admin phone and requests the default catalog", async () => {
    await withIdentityDatabase(async (sql) => {
      const admin = await changedAdmin(sql);
      const calls: { merchantId: string; tx: object }[] = [];
      defaultCatalog.register((input) => {
        calls.push(input);
        return Promise.resolve({ status: "created", catalogId: "cat_test" });
      });
      const created = await ensureStoreMerchant(sql, admin);
      expect(created).toMatchObject({ ok: true, created: true, default_catalog: "created" });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.merchantId).toBe(created.merchantId);
      const rows = await sql<{ phone: string; name: string }[]>`
        SELECT phone, name FROM merchants
      `;
      expect(rows).toEqual([{ phone, name: "本店" }]);
      const login = await loginMerchant(sql, { phone, password: next });
      expect(login.ok).toBe(true);
    });
  });

  it("still creates the store when the default catalog seam is unregistered", async () => {
    await withIdentityDatabase(async (sql) => {
      resetDefaultCatalog();
      const createdAdmin = await ensureSuperAdmin(sql, { phone, password });
      const created = await ensureStoreMerchant(sql, createdAdmin.admin);
      expect(created).toMatchObject({ ok: true, default_catalog: "pending" });
      const rows = await sql<{ status: string; must_change_password: boolean }[]>`
        SELECT status, must_change_password FROM merchants
      `;
      expect(rows[0]).toEqual({ status: "active", must_change_password: true });
    });
  });

  it("tells an unknown phone to use the store owner phone", async () => {
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
