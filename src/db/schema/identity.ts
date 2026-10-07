import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const admins = pgTable(
  "admins",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("admins_phone_active_uidx")
      .on(table.phone)
      .where(sql`deleted_at is null`),
  ],
);

export const merchants = pgTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("merchants_phone_active_uidx")
      .on(table.phone)
      .where(sql`deleted_at is null`),
  ],
);

export const buyers = pgTable(
  "buyers",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("buyers_phone_active_uidx")
      .on(table.phone)
      .where(sql`deleted_at is null`),
  ],
);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull(),
  scopes: text("scopes").array().notNull(),
  ...timestamps,
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const oauthGrants = pgTable("oauth_grants", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  clientName: text("client_name").notNull(),
  scopes: text("scopes").array().notNull(),
  refreshHash: text("refresh_hash"),
  ...timestamps,
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const usedCaptchaParams = pgTable("used_captcha_params", {
  captchaHash: text("captcha_hash").primaryKey(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrationChallenges = pgTable("registration_challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  captchaHash: text("captcha_hash").notNull(),
  smsVerifiedAt: timestamp("sms_verified_at", { withTimezone: true }),
  wrongChecks: integer("wrong_checks").notNull().default(0),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oidcRecords = pgTable("oidc_records", {
  model: text("model").notNull(),
  id: text("id").notNull(),
  payload: jsonb("payload").notNull(),
  grantId: text("grant_id"),
  userCode: text("user_code"),
  uid: text("uid"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const oauthSigningKeys = pgTable("oauth_signing_keys", {
  kid: text("kid").primaryKey(),
  jwk: jsonb("jwk").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
