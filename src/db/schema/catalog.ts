import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type CatalogFieldValue = string | number | boolean;

// merchant_id stays a plain text column. Do not add a merchants foreign key here.
export const catalogs = pgTable(
  "catalogs",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("CNY"),
    schemaRevision: integer("schema_revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("catalogs_merchant_active")
      .on(table.merchantId)
      .where(sql`deleted_at is null`),
  ],
);

export const schemaRevisions = pgTable(
  "schema_revisions",
  {
    id: text("id").primaryKey(),
    catalogId: text("catalog_id").notNull(),
    revision: integer("revision").notNull(),
    op: text("op").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    affectedCount: integer("affected_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("schema_revisions_catalog_revision").on(table.catalogId, table.revision)],
);

export const productFields = pgTable(
  "product_fields",
  {
    id: text("id").primaryKey(),
    catalogId: text("catalog_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").notNull(),
    choices: jsonb("choices").$type<readonly string[] | null>(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("product_fields_catalog_key").on(table.catalogId, table.key)],
);

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  catalogId: text("catalog_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  cover: text("cover"),
  fields: jsonb("fields").$type<Record<string, CatalogFieldValue>>().notNull().default({}),
  schemaRevision: integer("schema_revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const productOptions = pgTable(
  "product_options",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("product_options_product_key").on(table.productId, table.key)],
);

export const productImages = pgTable("product_images", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  catalogId: text("catalog_id")
    .notNull()
    .references(() => catalogs.id),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const variants = pgTable("variants", {
  id: text("id").primaryKey(),
  catalogId: text("catalog_id").notNull(),
  productId: text("product_id").notNull(),
  sku: text("sku"),
  optionValues: jsonb("option_values").$type<Record<string, string>>().notNull().default({}),
  price: integer("price").notNull(),
  stock: integer("stock"),
  status: text("status").notNull(),
  cover: text("cover"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
