import { and, eq, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "../../db/client";
import { orderItems, orders, payments } from "../../db/schema/commerce";
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
  StoredGraph,
  StoredItem,
  StoredOrder,
  StoredPayment,
} from "./repository";

type OrderRow = typeof orders.$inferSelect;
type ItemRow = typeof orderItems.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

type RowDb = Pick<Database, "select" | "insert" | "update" | "execute">;

export function createDrizzleCommerceRepository(db: Database): CommerceRepository {
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
    async applyStatuses(input) {
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
    status: asStatus(row.status),
    amount: row.amount,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    paidAt: row.paidAt,
  };
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
