import type { Actor, BuyerActor, MerchantActor } from "../../shared/actor";
import { hasScope } from "../../shared/actor";
import type { ErrorCode } from "../../shared/errors";
import { minorUnits, type MinorUnits } from "../../shared/money";

const orderLifetimeMs = 30 * 60 * 1000;

export type OrderStatus = "pending" | "paid" | "closed";

export type VariantSnapshot = {
  sku: string | null;
  optionValues: Readonly<Record<string, string>>;
  stock: number | null;
};

export type FieldsSnapshot = Readonly<Record<string, string | number | boolean | null>>;

export type PlaceLine = {
  variantId?: string;
  productId?: string;
  qty: number;
};

export type CommerceFailure = {
  ok: false;
  error: ErrorCode;
  message: string;
};

type StatusWrite = "payment" | "order";

export type ProviderTransition = {
  paymentStatus: OrderStatus;
  orderStatus: OrderStatus;
  paidAt: Date | null;
  changed: boolean;
  restoreStock: boolean;
  writes: readonly StatusWrite[];
};

function commerceFailure(error: ErrorCode, message: string): CommerceFailure {
  return { ok: false, error, message };
}

export function validateSingleLine(
  items: readonly PlaceLine[],
): { ok: true; line: PlaceLine } | CommerceFailure {
  if (items.length > 1) {
    return commerceFailure("too_many_items", "订单只能包含一行。");
  }
  const line = items[0];
  if (items.length !== 1 || line === undefined) {
    return commerceFailure("validation_error", "订单必须包含一行。");
  }
  if (!Number.isSafeInteger(line.qty) || line.qty <= 0) {
    return commerceFailure("validation_error", "数量必须是正整数。");
  }
  const hasVariant = line.variantId !== undefined && line.variantId.length > 0;
  const hasProduct = line.productId !== undefined && line.productId.length > 0;
  if (!hasVariant && !hasProduct) {
    return commerceFailure("validation_error", "请指定商品或规格。");
  }
  return { ok: true, line };
}

const callerPriceKeys = new Set([
  "price",
  "unit_price",
  "unitPrice",
  "amount",
  "total_amount",
  "totalAmount",
]);

export function rejectCallerPrice(body: unknown): { ok: true } | CommerceFailure {
  if (containsCallerPrice(body)) {
    return commerceFailure("validation_error", "不能传入价格。");
  }
  return { ok: true };
}

function containsCallerPrice(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsCallerPrice(item));
  }
  for (const [key, nested] of Object.entries(value)) {
    if (callerPriceKeys.has(key) || containsCallerPrice(nested)) {
      return true;
    }
  }
  return false;
}

export function lineAmount(unitPrice: MinorUnits, qty: number): MinorUnits {
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new TypeError("Quantity must be a positive integer");
  }
  const amount = unitPrice * qty;
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Line amount is not a safe integer");
  }
  return minorUnits(amount);
}

export function orderExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + orderLifetimeMs);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function isFiniteStock(stock: number | null): boolean {
  return stock !== null;
}

export function restoreQuantity(stock: number | null, qty: number): number {
  if (!isFiniteStock(stock)) {
    return 0;
  }
  return qty;
}

export function assertBuyerPlaces(actor: Actor): { ok: true; buyer: BuyerActor } | CommerceFailure {
  if (actor.type !== "buyer" || !hasScope(actor, "order:write")) {
    return commerceFailure("forbidden", "只有买家可以下单。");
  }
  return { ok: true, buyer: actor };
}

export function assertBuyerReads(actor: Actor): { ok: true; buyer: BuyerActor } | CommerceFailure {
  if (actor.type !== "buyer" || !hasScope(actor, "order:read")) {
    return commerceFailure("forbidden", "无权查看订单。");
  }
  return { ok: true, buyer: actor };
}

export function buyerOwns(buyerId: string, orderBuyerId: string): boolean {
  return buyerId === orderBuyerId;
}

export function assertMerchantReads(
  actor: Actor,
): { ok: true; merchant: MerchantActor } | CommerceFailure {
  if (actor.type !== "merchant" || !hasScope(actor, "order:read")) {
    return commerceFailure("forbidden", "无权查看订单。");
  }
  return { ok: true, merchant: actor };
}

export function merchantOwnsLines(
  lineCatalogIds: readonly string[],
  ownedCatalogIds: readonly string[],
): boolean {
  if (lineCatalogIds.length === 0) {
    return false;
  }
  const owned = new Set(ownedCatalogIds);
  return lineCatalogIds.every((catalogId) => owned.has(catalogId));
}

function unchanged(input: {
  orderStatus: OrderStatus;
  paymentStatus: OrderStatus;
  paidAt: Date | null;
}): ProviderTransition {
  return {
    paymentStatus: input.paymentStatus,
    orderStatus: input.orderStatus,
    paidAt: input.paidAt,
    changed: false,
    restoreStock: false,
    writes: [],
  };
}

export function applyProviderStatus(input: {
  orderStatus: OrderStatus;
  paymentStatus: OrderStatus;
  providerStatus: OrderStatus;
  paidAt: Date | null;
  now: Date;
}): ProviderTransition {
  if (input.providerStatus === "pending") {
    return unchanged(input);
  }
  if (input.providerStatus === "paid") {
    if (input.orderStatus === "closed" || input.paymentStatus === "closed") {
      return unchanged(input);
    }
    const writes: StatusWrite[] = [];
    if (input.paymentStatus !== "paid") {
      writes.push("payment");
    }
    if (input.orderStatus !== "paid") {
      writes.push("order");
    }
    if (writes.length === 0) {
      return unchanged(input);
    }
    return {
      paymentStatus: "paid",
      orderStatus: "paid",
      paidAt: input.paidAt ?? input.now,
      changed: true,
      restoreStock: false,
      writes,
    };
  }
  if (input.paymentStatus === "paid" || input.orderStatus === "paid") {
    return unchanged(input);
  }
  if (input.paymentStatus === "closed" && input.orderStatus === "closed") {
    return unchanged(input);
  }
  const writes: StatusWrite[] = [];
  if (input.paymentStatus !== "closed") {
    writes.push("payment");
  }
  if (input.orderStatus !== "closed") {
    writes.push("order");
  }
  return {
    paymentStatus: "closed",
    orderStatus: "closed",
    paidAt: input.paidAt,
    changed: writes.length > 0,
    restoreStock: input.orderStatus === "pending",
    writes,
  };
}

export function expiryDue(status: OrderStatus, expiresAt: Date, now: Date): boolean {
  return status === "pending" && isExpired(expiresAt, now);
}
