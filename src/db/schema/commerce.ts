import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import type { FieldsSnapshot, VariantSnapshot } from "../../domain/commerce/order";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
};

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id").notNull(),
    oauthGrantId: text("oauth_grant_id").notNull(),
    clientOrderNo: text("client_order_no").notNull(),
    currency: text("currency").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("orders_buyer_client_order_no_unique").on(table.buyerId, table.clientOrderNo),
  ],
);

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  catalogId: text("catalog_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  variantSnapshot: jsonb("variant_snapshot").$type<VariantSnapshot>().notNull(),
  priceSnapshot: integer("price_snapshot").notNull(),
  fieldsSnapshot: jsonb("fields_snapshot").$type<FieldsSnapshot>().notNull(),
  schemaRevision: integer("schema_revision").notNull(),
  qty: integer("qty").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    provider: text("provider").notNull(),
    channel: text("channel").notNull().default("desktop"),
    providerTradeNo: text("provider_trade_no"),
    actionUrl: text("action_url"),
    clientAddress: text("client_address"),
    stockReleaseAt: timestamp("stock_release_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("payments_provider_trade_no_unique")
      .on(table.providerTradeNo)
      .where(sql`${table.providerTradeNo} is not null`),
  ],
);

export const unappliedReceipts = pgTable("unapplied_receipts", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id")
    .notNull()
    .unique()
    .references(() => payments.id),
  providerTradeNo: text("provider_trade_no").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
});
