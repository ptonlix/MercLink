import { randomBytes } from "node:crypto";
import { copyFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { GET as publicStoreRoute } from "../../app/api/v1/store/route";
import { PUT as putProfileRoute } from "../../app/api/v1/merchant/profile/route";
import { runMigrations } from "../../db/migrate";
import { merchantActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { withIdentityDatabase } from "./database";
import { registerMerchantProfile, resetMerchantProfileStore } from "./profile-http";

async function responseJson(response: Response): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown;
}

const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = databaseUrl !== undefined && databaseUrl.trim() !== "";

describe.skipIf(!hasDatabase)("merchant profile sql", () => {
  afterEach(() => {
    resetAuthenticator();
    resetMerchantProfileStore();
  });

  it("does not publish the provisioned name and hides a disabled merchant", async () => {
    await withIdentityDatabase(async (sql) => {
      await sql`
        INSERT INTO admins (id, phone, password_hash)
        VALUES ('adm_profile', '13800000000', 'hash')
      `;
      await sql`
        INSERT INTO merchants (id, name, phone, email, password_hash, status, created_by)
        VALUES (
          'mch_profile', '超管填写的账号名', '13800000009', 'secret@example.com',
          'hash-secret', 'active', 'adm_profile'
        )
      `;
      const before = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM merchant_profiles
      `;
      expect(before[0]?.count).toBe("0");

      registerMerchantProfile(sql);
      registerAuthenticator(() => ({
        ok: true,
        actor: merchantActor({
          merchantId: "mch_profile",
          grantId: "grn_profile",
          scopes: ["product:write"],
        }),
      }));
      const saved = await putProfileRoute(
        new Request("https://merclink.example/api/v1/merchant/profile", {
          method: "PUT",
          headers: {
            authorization: "Bearer merchant-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            display_name: "南风商店",
            summary: "数据库里的已发布简介",
            website_url: null,
            logo_url: null,
            area_served: null,
            address: null,
            license: null,
            contact: null,
            published: true,
          }),
        }),
      );
      expect(saved.status).toBe(200);
      const shown = await publicStoreRoute();
      const shownBody = await responseJson(shown);
      expect(shown.status).toBe(200);
      expect(shownBody).toMatchObject({
        code: 200,
        data: {
          display_name: "南风商店",
          summary: "数据库里的已发布简介",
          license: null,
          contact: null,
        },
      });
      expect(JSON.stringify(shownBody)).not.toContain("13800000009");
      expect(JSON.stringify(shownBody)).not.toContain("secret@example.com");
      expect(JSON.stringify(shownBody)).not.toContain("hash-secret");
      expect(JSON.stringify(shownBody)).not.toContain("超管填写的账号名");
      expect(JSON.stringify(shownBody)).not.toContain("mch_profile");

      await sql`UPDATE merchants SET status = 'disabled' WHERE id = 'mch_profile'`;
      const hidden = await publicStoreRoute();
      expect(hidden.status).toBe(404);
      const hiddenBody = await responseJson(hidden);
      expect(hiddenBody).toMatchObject({ code: 40400, data: null });
      expect(JSON.stringify(hiddenBody)).not.toContain("数据库里的已发布简介");
    });
  });

  it("adds nullable facts without backfilling an existing profile row", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
    }
    const staging = await mkdtemp(path.join(tmpdir(), "merclink-profile-facts-"));
    const schema = `pf_${randomBytes(4).toString("hex")}`;
    const admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.end({ timeout: 5 });
    try {
      await copyFile(
        path.join(process.cwd(), "src/db/migrations/010_schema.sql"),
        path.join(staging, "010_schema.sql"),
      );
      await copyFile(
        path.join(process.cwd(), "src/db/migrations/011_merchant_profiles.sql"),
        path.join(staging, "011_merchant_profiles.sql"),
      );
      await runMigrations({ databaseUrl, directory: staging, searchPath: schema });
      const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
      try {
        await sql`SET search_path TO ${sql(schema)}`;
        await sql`
          INSERT INTO admins (id, phone, password_hash)
          VALUES ('adm_old', '13800000000', 'hash')
        `;
        await sql`
          INSERT INTO merchants (id, name, phone, password_hash, status, created_by)
          VALUES ('mch_old', '旧账号', '13800000008', 'hash', 'active', 'adm_old')
        `;
        await sql`
          INSERT INTO merchant_profiles (merchant_id, display_name, summary)
          VALUES ('mch_old', '旧店', '旧简介')
        `;
        await copyFile(
          path.join(process.cwd(), "src/db/migrations/016_merchant_profile_facts.sql"),
          path.join(staging, "016_merchant_profile_facts.sql"),
        );
        await runMigrations({ databaseUrl, directory: staging, searchPath: schema });
        const rows = await sql<{ licenseName: string | null; contactPhone: string | null }[]>`
          SELECT license_name AS "licenseName", contact_phone AS "contactPhone"
          FROM merchant_profiles
          WHERE merchant_id = 'mch_old'
        `;
        expect(rows).toEqual([{ licenseName: null, contactPhone: null }]);
        const images = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM merchant_profile_images
        `;
        expect(images[0]?.count).toBe("0");
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      const drop = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
      await drop.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await drop.end({ timeout: 5 });
      await rm(staging, { recursive: true, force: true });
    }
  });
});
