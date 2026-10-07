import { getTableName } from "drizzle-orm";
import { merchantProfiles } from "../../db/schema/identity";
import type { Sql } from "../../db/client";
import type { ProfileDraft } from "../../domain/identity/profile";
import type { PublicStoreProfile } from "../../shared/seams/public-store";

const profileTable = getTableName(merchantProfiles);

export type StoredProfile = ProfileDraft & {
  updatedAt: Date;
};

type ProfileSecretsRow = {
  phone: string;
  email: string | null;
};

export type MerchantProfileStore = {
  readOwn: (merchantId: string) => Promise<StoredProfile | null>;
  replace: (merchantId: string, profile: ProfileDraft) => Promise<StoredProfile>;
  readPublished: () => Promise<PublicStoreProfile | null>;
  secrets: (merchantId: string) => Promise<ProfileSecretsRow | null>;
};

type ProfileRow = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
  published: boolean;
  updatedAt: Date | string;
};

type PublicRow = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
};

type SecretRow = {
  phone: string;
  email: string | null;
  deletedAt: Date | null;
};

export function createSqlProfileStore(sql: Sql): MerchantProfileStore {
  return {
    async readOwn(merchantId) {
      const rows = await sql<ProfileRow[]>`
        SELECT
          display_name AS "displayName",
          summary,
          website_url AS "websiteUrl",
          logo_url AS "logoUrl",
          area_served AS "areaServed",
          address,
          published,
          updated_at AS "updatedAt"
        FROM ${sql(profileTable)}
        WHERE merchant_id = ${merchantId}
        LIMIT 1
      `;
      const row = rows[0];
      return row === undefined ? null : storedFrom(row);
    },
    async replace(merchantId, profile) {
      const rows = await sql<ProfileRow[]>`
        INSERT INTO ${sql(profileTable)} (
          merchant_id, display_name, summary, website_url, logo_url, area_served, address,
          published, updated_at
        ) VALUES (
          ${merchantId}, ${profile.displayName}, ${profile.summary}, ${profile.websiteUrl},
          ${profile.logoUrl}, ${profile.areaServed}, ${profile.address}, ${profile.published},
          now()
        )
        ON CONFLICT (merchant_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          summary = EXCLUDED.summary,
          website_url = EXCLUDED.website_url,
          logo_url = EXCLUDED.logo_url,
          area_served = EXCLUDED.area_served,
          address = EXCLUDED.address,
          published = EXCLUDED.published,
          updated_at = now()
        RETURNING
          display_name AS "displayName",
          summary,
          website_url AS "websiteUrl",
          logo_url AS "logoUrl",
          area_served AS "areaServed",
          address,
          published,
          updated_at AS "updatedAt"
      `;
      const row = rows[0];
      if (row === undefined) {
        throw new Error("merchant profile replace did not return a row");
      }
      return storedFrom(row);
    },
    async readPublished() {
      const rows = await sql<PublicRow[]>`
        SELECT
          p.display_name AS "displayName",
          p.summary,
          p.website_url AS "websiteUrl",
          p.logo_url AS "logoUrl",
          p.area_served AS "areaServed",
          p.address
        FROM ${sql(profileTable)} AS p
        JOIN merchants AS m ON m.id = p.merchant_id
        WHERE p.published = true
          AND m.status = 'active'
          AND m.deleted_at IS NULL
        ORDER BY p.updated_at DESC, p.merchant_id
        LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      return {
        displayName: row.displayName,
        summary: row.summary,
        websiteUrl: row.websiteUrl,
        logoUrl: row.logoUrl,
        areaServed: row.areaServed,
        address: row.address,
      };
    },
    async secrets(merchantId) {
      const rows = await sql<SecretRow[]>`
        SELECT phone, email, deleted_at AS "deletedAt"
        FROM merchants
        WHERE id = ${merchantId}
        LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined || row.deletedAt !== null) {
        return null;
      }
      return { phone: row.phone, email: row.email };
    },
  };
}

function storedFrom(row: ProfileRow): StoredProfile {
  return {
    displayName: row.displayName,
    summary: row.summary,
    websiteUrl: row.websiteUrl,
    logoUrl: row.logoUrl,
    areaServed: row.areaServed,
    address: row.address,
    published: row.published,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}
