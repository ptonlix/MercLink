import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontReleases = pgTable("storefront_releases", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  sourceKey: text("source_key").notNull(),
  fallback: text("fallback"),
  authorizeBuyer: text("authorize_buyer"),
  authorizeMerchant: text("authorize_merchant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const storefrontFiles = pgTable(
  "storefront_files",
  {
    releaseId: text("release_id").notNull(),
    path: text("path").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.path] })],
);

export const storefrontPointer = pgTable("storefront_pointer", {
  id: text("id").primaryKey(),
  activeReleaseId: text("active_release_id"),
  previousReleaseId: text("previous_release_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
