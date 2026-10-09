import { and, eq, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../../db/client";
import { orderItems, orders, payments, unappliedReceipts } from "../../db/schema/commerce";
import type {
  FieldsSnapshot,
  OrderStatus,
  PaymentChannel,
  VariantSnapshot,
} from "../../domain/commerce/order";
import { expiryDue } from "../../domain/commerce/order";
import type {
  CommerceRepository,
  CommerceUnit,
  ReceiptStatus,
  StoredGraph,
  StoredItem,
  StoredOrder,
  StoredPayment,
  StoredReceipt,
} from "./repository";

type OrderRow = typeof orders.$inferSelect;
type ItemRow = typeof orderItems.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ReceiptRow = typeof unappliedReceipts.$inferSelect;

type RowDb = Pick<Database, "select" | "insert" | "update" | "execute">;

export function createDrizzleCommerceRepository(db: Database): CommerceRepository {
  const claims = new Set<string>();
  return {
    transaction(run) {
      return db.transaction(async (tx) => {
        const client = postgresTransaction(tx);
        return run(createUnit(tx, client));
      });
    },
    findById(orderId) {
      return loadById(db, orderId);
    },
    async findPaymentByTradeNo(providerTradeNo) {
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.providerTradeNo, providerTradeNo))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : mapPayment(row);
    },
    async findPaymentById(paymentId) {
      const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      const row = rows[0];
      return row === undefined ? null : mapPayment(row);
    },
    saveProviderTradeNo(paymentId, providerTradeNo) {
      return saveTradeNo(db, paymentId, providerTradeNo);
    },
    saveActionUrl(paymentId, actionUrl) {
      return saveNullablePayment(db, paymentId, { actionUrl });
    },
    saveClientAddress(paymentId, clientAddress) {
      return saveNullablePayment(db, paymentId, { clientAddress });
    },
    findReceipt(paymentId) {
      return loadReceipt(db, paymentId);
    },
    insertOpenReceipt(input) {
      return insertReceipt(db, input);
    },
    claimReceipt(input) {
      return claimReceipt(db, claims, input);
    },
    releaseReceiptClaim(paymentId) {
      claims.delete(paymentId);
      return Promise.resolve();
    },
    resolveReceipt(input) {
      return updateReceipt(db, input);
    },
    listByCatalogs(catalogIds) {
      return listGraphs(db, catalogIds);
    },
    async listExpiredPending(now) {
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.status, "pending"), lte(orders.expiresAt, now)));
      return rows.map(mapOrder);
    },
  };
}

function postgresTransaction(tx: object): CommerceUnit["seamTx"] {
  const session = (tx as { session?: { client?: CommerceUnit["seamTx"] } }).session;
  return session?.client ?? tx;
}

function createUnit(db: RowDb, seamTx: CommerceUnit["seamTx"] = db): CommerceUnit {
  return {
    seamTx,
    findByClientNo(buyerId, clientOrderNo) {
      return loadByClientNo(db, buyerId, clientOrderNo);
    },
    findById(orderId) {
      return loadById(db, orderId);
    },
    async insertGraph(graph) {
      await db.insert(orders).values(orderValues(graph.order));
      await db.insert(orderItems).values(graph.items.map(itemValues));
      await db.insert(payments).values(paymentValues(graph.payment));
    },
    async lockOrder(orderId) {
      await db.execute(sql`select id from orders where id = ${orderId} for update`);
      return loadById(db, orderId);
    },
    async lockPending(orderId, now) {
      await db.execute(sql`select id from orders where id = ${orderId} for update`);
      const graph = await loadById(db, orderId);
      if (graph === null || !expiryDue(graph.order.status, graph.order.expiresAt, now)) {
        return null;
      }
      if (graph.payment.status !== "pending") {
        return null;
      }
      return graph;
    },
    async markClosed(orderId, now) {
      const updated = await db
        .update(orders)
        .set({ status: "closed", updatedAt: now })
        .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
        .returning({ id: orders.id });
      if (updated.length === 0) {
        return false;
      }
      await db
        .update(payments)
        .set({ status: "closed", updatedAt: now })
        .where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")));
      return true;
    },
    async setStockReleaseAt(orderId, releaseAt, now) {
      const updated = await db
        .update(payments)
        .set({ stockReleaseAt: releaseAt, updatedAt: now })
        .where(and(eq(payments.orderId, orderId), sql`${payments.stockReleaseAt} is null`))
        .returning({ id: payments.id });
      return updated.length > 0;
    },
    async applyStatuses(input) {
      return applyStatuses(db, input);
    },
    insertOpenReceipt(input) {
      return insertReceipt(db, input);
    },
    listByCatalogs(catalogIds) {
      return listGraphs(db, catalogIds);
    },
    async listExpiredPending(now) {
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.status, "pending"), lte(orders.expiresAt, now)));
      return rows.map(mapOrder);
    },
  };
}

async function loadById(db: RowDb, orderId: string): Promise<StoredGraph | null> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return assemble(db, [row]);
}

async function loadByClientNo(
  db: RowDb,
  buyerId: string,
  clientOrderNo: string,
): Promise<StoredGraph | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.buyerId, buyerId), eq(orders.clientOrderNo, clientOrderNo)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return assemble(db, [row]);
}

async function listGraphs(db: RowDb, catalogIds: readonly string[]): Promise<StoredGraph[]> {
  if (catalogIds.length === 0) {
    return [];
  }
  const itemRows = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.catalogId, [...catalogIds]));
  const orderIds = [...new Set(itemRows.map((item) => item.orderId))];
  if (orderIds.length === 0) {
    return [];
  }
  const orderRows = await db.select().from(orders).where(inArray(orders.id, orderIds));
  const graphs: StoredGraph[] = [];
  for (const order of orderRows) {
    const graph = await assemble(db, [order]);
    if (graph !== null) {
      graphs.push(graph);
    }
  }
  return graphs;
}

async function assemble(db: RowDb, orderRows: readonly OrderRow[]): Promise<StoredGraph | null> {
  const order = orderRows[0];
  if (order === undefined) {
    return null;
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .limit(1);
  const payment = paymentRows[0];
  if (payment === undefined) {
    return null;
  }
  return {
    order: mapOrder(order),
    items: items.map(mapItem),
    payment: mapPayment(payment),
  };
}

async function saveTradeNo(db: RowDb, paymentId: string, providerTradeNo: string): Promise<void> {
  await db
    .update(payments)
    .set({ providerTradeNo, updatedAt: new Date() })
    .where(and(eq(payments.id, paymentId), sql`${payments.providerTradeNo} is null`));
}

function orderValues(order: StoredOrder): typeof orders.$inferInsert {
  return {
    id: order.id,
    buyerId: order.buyerId,
    oauthGrantId: order.oauthGrantId,
    clientOrderNo: order.clientOrderNo,
    currency: order.currency,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
  };
}

function itemValues(item: StoredItem): typeof orderItems.$inferInsert {
  return {
    id: item.id,
    orderId: item.orderId,
    catalogId: item.catalogId,
    productId: item.productId,
    variantId: item.variantId,
    titleSnapshot: item.titleSnapshot,
    variantSnapshot: item.variantSnapshot,
    priceSnapshot: item.priceSnapshot,
    fieldsSnapshot: item.fieldsSnapshot,
    schemaRevision: item.schemaRevision,
    qty: item.qty,
    amount: item.amount,
    createdAt: item.createdAt,
  };
}

function paymentValues(payment: StoredPayment): typeof payments.$inferInsert {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    channel: payment.channel,
    providerTradeNo: payment.providerTradeNo,
    actionUrl: payment.actionUrl,
    clientAddress: payment.clientAddress,
    stockReleaseAt: payment.stockReleaseAt,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    paidAt: payment.paidAt,
  };
}

function mapOrder(row: OrderRow): StoredOrder {
  return {
    id: row.id,
    buyerId: row.buyerId,
    oauthGrantId: row.oauthGrantId,
    clientOrderNo: row.clientOrderNo,
    currency: row.currency,
    amount: row.amount,
    status: asStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    paidAt: row.paidAt,
    expiresAt: row.expiresAt,
  };
}

function mapItem(row: ItemRow): StoredItem {
  return {
    id: row.id,
    orderId: row.orderId,
    catalogId: row.catalogId,
    productId: row.productId,
    variantId: row.variantId,
    titleSnapshot: row.titleSnapshot,
    variantSnapshot: readVariantSnapshot(row.variantSnapshot),
    priceSnapshot: row.priceSnapshot,
    fieldsSnapshot: readFields(row.fieldsSnapshot),
    schemaRevision: row.schemaRevision,
    qty: row.qty,
    amount: row.amount,
    createdAt: row.createdAt,
  };
}

function mapPayment(row: PaymentRow): StoredPayment {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    channel: paymentChannel(row.channel),
    providerTradeNo: row.providerTradeNo,
    actionUrl: row.actionUrl,
    clientAddress: row.clientAddress,
    stockReleaseAt: row.stockReleaseAt,
    status: asStatus(row.status),
    amount: row.amount,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    paidAt: row.paidAt,
  };
}

async function saveNullablePayment(
  db: RowDb,
  paymentId: string,
  patch: { actionUrl?: string; clientAddress?: string },
): Promise<void> {
  if (patch.actionUrl !== undefined) {
    await db
      .update(payments)
      .set({ actionUrl: patch.actionUrl, updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), sql`${payments.actionUrl} is null`));
  }
  if (patch.clientAddress !== undefined) {
    await db
      .update(payments)
      .set({ clientAddress: patch.clientAddress, updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), sql`${payments.clientAddress} is null`));
  }
}

async function loadReceipt(db: RowDb, paymentId: string): Promise<StoredReceipt | null> {
  const rows = await db
    .select()
    .from(unappliedReceipts)
    .where(eq(unappliedReceipts.paymentId, paymentId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : mapReceipt(row);
}

async function insertReceipt(
  db: RowDb,
  input: {
    id: string;
    paymentId: string;
    providerTradeNo: string;
    amount: number;
    now: Date;
  },
): Promise<StoredReceipt> {
  await db
    .insert(unappliedReceipts)
    .values({
      id: input.id,
      paymentId: input.paymentId,
      providerTradeNo: input.providerTradeNo,
      amount: input.amount,
      status: "open",
      failureReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: unappliedReceipts.paymentId });
  const stored = await loadReceipt(db, input.paymentId);
  if (stored === null) {
    throw new Error("unapplied receipt was not stored");
  }
  return stored;
}

async function applyStatuses(
  db: RowDb,
  input: {
    orderId: string;
    paymentStatus: OrderStatus;
    orderStatus: OrderStatus;
    paidAt: Date | null;
    now: Date;
    writes: readonly ("payment" | "order")[];
  },
): Promise<boolean> {
  const writingPaid = input.paymentStatus === "paid" || input.orderStatus === "paid";
  if (writingPaid) {
    if (input.writes.includes("payment")) {
      const updated = await db
        .update(payments)
        .set({
          status: input.paymentStatus,
          updatedAt: input.now,
          paidAt: input.paidAt,
        })
        .where(and(eq(payments.orderId, input.orderId), eq(payments.status, "pending")))
        .returning({ id: payments.id });
      if (updated.length === 0) {
        return false;
      }
    }
    if (input.writes.includes("order")) {
      const updated = await db
        .update(orders)
        .set({
          status: input.orderStatus,
          updatedAt: input.now,
          paidAt: input.paidAt,
        })
        .where(and(eq(orders.id, input.orderId), eq(orders.status, "pending")))
        .returning({ id: orders.id });
      if (updated.length === 0) {
        throw new Error("paid status was not applied to the locked order");
      }
    }
    return input.writes.includes("payment") || input.writes.includes("order");
  }
  for (const write of input.writes) {
    if (write === "payment") {
      await db
        .update(payments)
        .set({
          status: input.paymentStatus,
          updatedAt: input.now,
          paidAt: input.paymentStatus === "paid" ? input.paidAt : null,
        })
        .where(eq(payments.orderId, input.orderId));
    }
    if (write === "order") {
      await db
        .update(orders)
        .set({
          status: input.orderStatus,
          updatedAt: input.now,
          paidAt: input.orderStatus === "paid" ? input.paidAt : undefined,
        })
        .where(eq(orders.id, input.orderId));
    }
  }
  return true;
}

async function claimReceipt(
  db: RowDb,
  claims: Set<string>,
  input: {
    paymentId: string;
    expectedUpdatedAt: Date;
    now: Date;
  },
): Promise<StoredReceipt | null> {
  if (claims.has(input.paymentId)) {
    return null;
  }
  claims.add(input.paymentId);
  try {
    const updated = await db
      .update(unappliedReceipts)
      .set({ updatedAt: input.now })
      .where(
        and(
          eq(unappliedReceipts.paymentId, input.paymentId),
          inArray(unappliedReceipts.status, ["open", "refund_failed"]),
          eq(unappliedReceipts.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning();
    const row = updated[0];
    if (row === undefined) {
      claims.delete(input.paymentId);
      return null;
    }
    return mapReceipt(row);
  } catch (error) {
    claims.delete(input.paymentId);
    throw error;
  }
}

async function updateReceipt(
  db: RowDb,
  input: {
    paymentId: string;
    status: ReceiptStatus;
    failureReason: string | null;
    now: Date;
    expectedUpdatedAt: Date;
  },
): Promise<StoredReceipt | null> {
  const updated = await db
    .update(unappliedReceipts)
    .set({
      status: input.status,
      failureReason: input.failureReason,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(unappliedReceipts.paymentId, input.paymentId),
        inArray(unappliedReceipts.status, ["open", "refund_failed"]),
        eq(unappliedReceipts.updatedAt, input.expectedUpdatedAt),
      ),
    )
    .returning({ id: unappliedReceipts.id });
  if (updated.length === 0) {
    return null;
  }
  return loadReceipt(db, input.paymentId);
}

function mapReceipt(row: ReceiptRow): StoredReceipt {
  return {
    id: row.id,
    paymentId: row.paymentId,
    providerTradeNo: row.providerTradeNo,
    amount: row.amount,
    status: receiptStatus(row.status),
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function receiptStatus(value: string): ReceiptStatus {
  if (
    value === "open" ||
    value === "fulfilled_manually" ||
    value === "refunded" ||
    value === "refund_failed"
  ) {
    return value;
  }
  throw new Error(`Unexpected receipt status: ${value}`);
}

function asStatus(value: string): OrderStatus {
  if (value === "pending" || value === "paid" || value === "closed") {
    return value;
  }
  throw new Error(`Unexpected commerce status: ${value}`);
}

function paymentChannel(value: string): PaymentChannel {
  if (value === "desktop" || value === "mobile") {
    return value;
  }
  throw new Error(`Unexpected payment channel: ${value}`);
}

function readVariantSnapshot(value: unknown): VariantSnapshot {
  if (typeof value !== "object" || value === null) {
    return { sku: null, optionValues: {}, stock: null };
  }
  const record = value as Record<string, unknown>;
  const optionValues = record.optionValues;
  const stock = record.stock;
  return {
    sku: typeof record.sku === "string" ? record.sku : null,
    optionValues: isStringRecord(optionValues) ? optionValues : {},
    stock: typeof stock === "number" ? stock : null,
  };
}

function readFields(value: unknown): FieldsSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const fields: Record<string, string | number | boolean | null> = {};
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (
      typeof nested === "string" ||
      typeof nested === "number" ||
      typeof nested === "boolean" ||
      nested === null
    ) {
      fields[key] = nested;
    }
  }
  return fields;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
}
