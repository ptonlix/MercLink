import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  assertBuyerPlaces,
  lineAmount,
  orderExpiresAt,
  rejectCallerPrice,
  validateSingleLine,
  type CommerceFailure,
  type FieldsSnapshot,
  type VariantSnapshot,
} from "../../domain/commerce/order";
import { minorUnits } from "../../shared/money";
import type { Actor } from "../../shared/actor";
import { createPublicId } from "../../shared/id";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import { isUniqueViolation, type StoredGraph, type StoredItem } from "./repository";
import type { CommerceRuntime } from "./runtime";
import { httpStatus } from "./view";

const itemSchema = z.strictObject({
  variant_id: z.string().trim().min(1).optional(),
  product_id: z.string().trim().min(1).optional(),
  qty: z.number().int().positive(),
});

const bodySchema = z.strictObject({
  client_order_no: z.string().trim().min(1).max(128),
  items: z.array(itemSchema).min(1),
});

export type PlaceOrderResult =
  | {
      ok: true;
      graph: StoredGraph;
      action: unknown;
    }
  | (CommerceFailure & { httpStatus: number });

function parsePlaceOrderBody(raw: unknown):
  | {
      ok: true;
      clientOrderNo: string;
      variantId?: string;
      productId?: string;
      qty: number;
    }
  | CommerceFailure {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "validation_error", message: "请求无效。" };
  }
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.items) && record.items.length > 1) {
    return { ok: false, error: "too_many_items", message: "订单只能包含一行。" };
  }
  const priced = rejectCallerPrice(raw);
  if (!priced.ok) {
    return priced;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "validation_error", message: "请求无效。" };
  }
  const item = parsed.data.items[0];
  if (item === undefined) {
    return { ok: false, error: "validation_error", message: "订单必须包含一行。" };
  }
  const line = validateSingleLine([
    {
      ...(item.variant_id === undefined ? {} : { variantId: item.variant_id }),
      ...(item.product_id === undefined ? {} : { productId: item.product_id }),
      qty: item.qty,
    },
  ]);
  if (!line.ok) {
    return line;
  }
  return {
    ok: true,
    clientOrderNo: parsed.data.client_order_no,
    ...(line.line.variantId === undefined ? {} : { variantId: line.line.variantId }),
    ...(line.line.productId === undefined ? {} : { productId: line.line.productId }),
    qty: line.line.qty,
  };
}

export async function placeOrder(input: {
  actor: Actor;
  body: unknown;
  runtime: CommerceRuntime;
}): Promise<PlaceOrderResult> {
  const buyer = assertBuyerPlaces(input.actor);
  if (!buyer.ok) {
    return { ...buyer, httpStatus: httpStatus(buyer.error) };
  }
  const parsed = parsePlaceOrderBody(input.body);
  if (!parsed.ok) {
    return { ...parsed, httpStatus: httpStatus(parsed.error) };
  }

  let graph: StoredGraph;
  try {
    const placed = await input.runtime.repo.transaction(async (unit) => {
      const existing = await unit.findByClientNo(buyer.buyer.buyerId, parsed.clientOrderNo);
      if (existing !== null) {
        return existing;
      }
      const locked = await sellableVariants.lock({
        ...(parsed.variantId === undefined ? {} : { variantId: parsed.variantId }),
        ...(parsed.productId === undefined ? {} : { productId: parsed.productId }),
        qty: parsed.qty,
        tx: unit.seamTx,
      });
      if (!locked.ok) {
        return locked;
      }
      const createdAt = input.runtime.clock.now();
      const amount = lineAmount(locked.line.unitPrice, parsed.qty);
      const orderId = createPublicId("order");
      const item: StoredItem = {
        id: createPublicId("orderLine"),
        orderId,
        catalogId: locked.line.catalogId,
        productId: locked.line.productId,
        variantId: locked.line.variantId,
        titleSnapshot: locked.line.title,
        variantSnapshot: snapshotVariant(locked.line),
        priceSnapshot: locked.line.unitPrice,
        fieldsSnapshot: snapshotFields(locked.line.fields),
        schemaRevision: locked.line.schemaRevision,
        qty: parsed.qty,
        amount,
        createdAt,
      };
      const next: StoredGraph = {
        order: {
          id: orderId,
          buyerId: buyer.buyer.buyerId,
          oauthGrantId: buyer.buyer.grantId,
          clientOrderNo: parsed.clientOrderNo,
          currency: locked.line.currency,
          amount,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
          paidAt: null,
          expiresAt: orderExpiresAt(createdAt),
        },
        items: [item],
        payment: {
          id: createPaymentId(),
          orderId,
          provider: "alipay",
          providerTradeNo: null,
          status: "pending",
          amount,
          currency: locked.line.currency,
          createdAt,
          updatedAt: createdAt,
          paidAt: null,
        },
      };
      await unit.insertGraph(next);
      return next;
    });
    if ("error" in placed) {
      return { ...placed, httpStatus: httpStatus(placed.error) };
    }
    graph = placed;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const raced = await input.runtime.repo.transaction((unit) =>
      unit.findByClientNo(buyer.buyer.buyerId, parsed.clientOrderNo),
    );
    if (raced === null) {
      throw error;
    }
    graph = raced;
  }

  if (graph.order.status !== "pending" || graph.payment.status !== "pending") {
    return { ok: true, graph, action: null };
  }
  const subject = graph.items[0]?.titleSnapshot ?? "order";
  const created = await input.runtime.payment.createPayment({
    paymentId: graph.payment.id,
    orderId: graph.order.id,
    amount: minorUnits(graph.order.amount),
    currency: graph.order.currency,
    subject,
  });
  if (!created.ok) {
    return {
      ok: false,
      error: "payment_retryable",
      message: created.message,
      httpStatus: httpStatus("payment_retryable"),
    };
  }
  if (created.providerTradeNo !== null) {
    await input.runtime.repo.saveProviderTradeNo(graph.payment.id, created.providerTradeNo);
    graph = {
      ...graph,
      payment: { ...graph.payment, providerTradeNo: created.providerTradeNo },
    };
  }
  return { ok: true, graph, action: created.action };
}

function createPaymentId(): string {
  return `pay_${randomBytes(16).toString("hex")}`;
}

function snapshotVariant(line: {
  sku: string | null;
  optionValues: Readonly<Record<string, string>>;
  stock: number | null;
}): VariantSnapshot {
  return {
    sku: line.sku,
    optionValues: { ...line.optionValues },
    stock: line.stock,
  };
}

function snapshotFields(
  fields: Readonly<Record<string, string | number | boolean | null>>,
): FieldsSnapshot {
  return { ...fields };
}


