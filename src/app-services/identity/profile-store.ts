import { getTableName } from "drizzle-orm";
import { merchantProfileImages, merchantProfiles } from "../../db/schema/identity";
import type { Sql } from "../../db/client";
import type {
  OwnedProfileImage,
  ProfileContact,
  ProfileDraft,
  ProfileLicense,
} from "../../domain/identity/profile";
import type { PublicStoreProfile } from "../../shared/seams/public-store";

const profileTable = getTableName(merchantProfiles);
const profileImageTable = getTableName(merchantProfileImages);

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
  ownedImages: (merchantId: string) => Promise<readonly OwnedProfileImage[]>;
  secrets: (merchantId: string) => Promise<ProfileSecretsRow | null>;
};

type ProfileRow = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
  licenseName: string | null;
  licenseCreditCode: string | null;
  licenseLegalPerson: string | null;
  licenseRegisteredAddress: string | null;
  licenseImageUrl: string | null;
  contactPhone: string | null;
  contactLabel: string | null;
  contactQrUrl: string | null;
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
  licenseName: string | null;
  licenseCreditCode: string | null;
  licenseLegalPerson: string | null;
  licenseRegisteredAddress: string | null;
  licenseImageUrl: string | null;
  contactPhone: string | null;
  contactLabel: string | null;
  contactQrUrl: string | null;
};

type OwnedImageRow = {
  id: string;
  purpose: string;
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
          license_name AS "licenseName",
          license_credit_code AS "licenseCreditCode",
          license_legal_person AS "licenseLegalPerson",
          license_registered_address AS "licenseRegisteredAddress",
          license_image_url AS "licenseImageUrl",
          contact_phone AS "contactPhone",
          contact_label AS "contactLabel",
          contact_qr_url AS "contactQrUrl",
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
          license_name, license_credit_code, license_legal_person, license_registered_address,
          license_image_url, contact_phone, contact_label, contact_qr_url, published, updated_at
        ) VALUES (
          ${merchantId}, ${profile.displayName}, ${profile.summary}, ${profile.websiteUrl},
          ${profile.logoUrl}, ${profile.areaServed}, ${profile.address},
          ${profile.license?.name ?? null}, ${profile.license?.creditCode ?? null},
          ${profile.license?.legalPerson ?? null}, ${profile.license?.registeredAddress ?? null},
          ${profile.license?.imageUrl ?? null}, ${profile.contact?.phone ?? null},
          ${profile.contact?.label ?? null}, ${profile.contact?.qrUrl ?? null},
          ${profile.published}, now()
        )
        ON CONFLICT (merchant_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          summary = EXCLUDED.summary,
          website_url = EXCLUDED.website_url,
          logo_url = EXCLUDED.logo_url,
          area_served = EXCLUDED.area_served,
          address = EXCLUDED.address,
          license_name = EXCLUDED.license_name,
          license_credit_code = EXCLUDED.license_credit_code,
          license_legal_person = EXCLUDED.license_legal_person,
          license_registered_address = EXCLUDED.license_registered_address,
          license_image_url = EXCLUDED.license_image_url,
          contact_phone = EXCLUDED.contact_phone,
          contact_label = EXCLUDED.contact_label,
          contact_qr_url = EXCLUDED.contact_qr_url,
          published = EXCLUDED.published,
          updated_at = now()
        RETURNING
          display_name AS "displayName",
          summary,
          website_url AS "websiteUrl",
          logo_url AS "logoUrl",
          area_served AS "areaServed",
          address,
          license_name AS "licenseName",
          license_credit_code AS "licenseCreditCode",
          license_legal_person AS "licenseLegalPerson",
          license_registered_address AS "licenseRegisteredAddress",
          license_image_url AS "licenseImageUrl",
          contact_phone AS "contactPhone",
          contact_label AS "contactLabel",
          contact_qr_url AS "contactQrUrl",
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
          p.address,
          p.license_name AS "licenseName",
          p.license_credit_code AS "licenseCreditCode",
          p.license_legal_person AS "licenseLegalPerson",
          p.license_registered_address AS "licenseRegisteredAddress",
          p.license_image_url AS "licenseImageUrl",
          p.contact_phone AS "contactPhone",
          p.contact_label AS "contactLabel",
          p.contact_qr_url AS "contactQrUrl"
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
      return publicFrom(row);
    },
    async ownedImages(merchantId) {
      const rows = await sql<OwnedImageRow[]>`
        SELECT id, purpose
        FROM ${sql(profileImageTable)}
        WHERE merchant_id = ${merchantId}
      `;
      return rows.flatMap((row) =>
        row.purpose === "license" || row.purpose === "contact_qr"
          ? [{ id: row.id, purpose: row.purpose }]
          : [],
      );
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
    license: licenseFrom(row),
    contact: contactFrom(row),
    published: row.published,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function publicFrom(row: PublicRow): PublicStoreProfile {
  return {
    displayName: row.displayName,
    summary: row.summary,
    websiteUrl: row.websiteUrl,
    logoUrl: row.logoUrl,
    areaServed: row.areaServed,
    address: row.address,
    license: licenseFrom(row),
    contact: contactFrom(row),
  };
}

function licenseFrom(row: PublicRow): ProfileLicense | null {
  if (
    row.licenseName === null ||
    row.licenseCreditCode === null ||
    row.licenseLegalPerson === null ||
    row.licenseRegisteredAddress === null ||
    row.licenseImageUrl === null
  ) {
    return null;
  }
  return {
    name: row.licenseName,
    creditCode: row.licenseCreditCode,
    legalPerson: row.licenseLegalPerson,
    registeredAddress: row.licenseRegisteredAddress,
    imageUrl: row.licenseImageUrl,
  };
}

function contactFrom(row: PublicRow): ProfileContact | null {
  if (row.contactPhone === null && row.contactQrUrl === null) {
    return null;
  }
  return {
    phone: row.contactPhone,
    label: row.contactLabel,
    qrUrl: row.contactQrUrl,
  };
}
