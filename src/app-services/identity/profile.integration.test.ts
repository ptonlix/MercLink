import { afterEach, describe, expect, it } from "vitest";
import { GET as publicStoreRoute } from "../../app/api/v1/store/route";
import { PUT as putProfileRoute } from "../../app/api/v1/merchant/profile/route";
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
            published: true,
          }),
        }),
      );
      expect(saved.status).toBe(200);
      const shown = await publicStoreRoute();
      const shownBody = await responseJson(shown);
      expect(shown.status).toBe(200);
      expect(shownBody).toMatchObject({
        display_name: "南风商店",
        summary: "数据库里的已发布简介",
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
      expect(hiddenBody).toMatchObject({ error: "not_found" });
      expect(JSON.stringify(hiddenBody)).not.toContain("数据库里的已发布简介");
    });
  });
});
