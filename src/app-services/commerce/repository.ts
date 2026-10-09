import type { SeamTransaction } from "../../shared/seams/sellable-variants";
import type {
  FieldsSnapshot,
  OrderStatus,
  PaymentChannel,
  VariantSnapshot,
} from "../../domain/commerce/order";

export type StoredOrder = {
  id: string;
  buyerId: string;
  oauthGrantId: string;
  clientOrderNo: string;
  currency: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  expiresAt: Date;
};

export type StoredItem = {
  id: string;
  orderId: string;
  catalogId: string;
  productId: string;
  variantId: string;
  titleSnapshot: string;
  variantSnapshot: VariantSnapshot;
  priceSnapshot: number;
  fieldsSnapshot: FieldsSnapshot;
  schemaRevision: number;
  qty: number;
  amount: number;
  createdAt: Date;
};

export type ReceiptStatus = "open" | "fulfilled_manually" | "refunded" | "refund_failed";

export type StoredReceipt = {
  id: string;
  paymentId: string;
  providerTradeNo: string;
  amount: number;
  status: ReceiptStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredPayment = {
  id: string;
  orderId: string;
  provider: string;
  channel: PaymentChannel;
  providerTradeNo: string | null;
  actionUrl: string | null;
  clientAddress: string | null;
  stockReleaseAt: Date | null;
  status: OrderStatus;
  amount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
};

export type StoredGraph = {
  order: StoredOrder;
  items: readonly StoredItem[];
  payment: StoredPayment;
};

export type CommerceUnit = {
  seamTx: SeamTransaction;
  findByClientNo(buyerId: string, clientOrderNo: string): Promise<StoredGraph | null>;
  findById(orderId: string): Promise<StoredGraph | null>;
  insertGraph(graph: StoredGraph): Promise<void>;
  lockOrder(orderId: string): Promise<StoredGraph | null>;
  lockPending(orderId: string, now: Date): Promise<StoredGraph | null>;
  markClosed(orderId: string, now: Date): Promise<boolean>;
  setStockReleaseAt(orderId: string, releaseAt: Date, now: Date): Promise<boolean>;
  applyStatuses(input: {
    orderId: string;
    paymentStatus: OrderStatus;
    orderStatus: OrderStatus;
    paidAt: Date | null;
    now: Date;
    writes: readonly ("payment" | "order")[];
  }): Promise<boolean>;
  insertOpenReceipt(input: {
    id: string;
    paymentId: string;
    providerTradeNo: string;
    amount: number;
    now: Date;
  }): Promise<StoredReceipt>;
  listByCatalogs(catalogIds: readonly string[]): Promise<StoredGraph[]>;
  listExpiredPending(now: Date): Promise<StoredOrder[]>;
};

export type CommerceRepository = {
  transaction<T>(run: (unit: CommerceUnit) => Promise<T>): Promise<T>;
  findById(orderId: string): Promise<StoredGraph | null>;
  findPaymentByTradeNo(providerTradeNo: string): Promise<StoredPayment | null>;
  findPaymentById(paymentId: string): Promise<StoredPayment | null>;
  saveProviderTradeNo(paymentId: string, providerTradeNo: string): Promise<void>;
  saveActionUrl(paymentId: string, actionUrl: string): Promise<void>;
  saveClientAddress(paymentId: string, clientAddress: string): Promise<void>;
  findReceipt(paymentId: string): Promise<StoredReceipt | null>;
  insertOpenReceipt(input: {
    id: string;
    paymentId: string;
    providerTradeNo: string;
    amount: number;
    now: Date;
  }): Promise<StoredReceipt>;
  claimReceipt(input: {
    paymentId: string;
    expectedUpdatedAt: Date;
    now: Date;
  }): Promise<StoredReceipt | null>;
  releaseReceiptClaim(paymentId: string): Promise<void>;
  resolveReceipt(input: {
    paymentId: string;
    status: ReceiptStatus;
    failureReason: string | null;
    now: Date;
    expectedUpdatedAt: Date;
  }): Promise<StoredReceipt | null>;
  listByCatalogs(catalogIds: readonly string[]): Promise<StoredGraph[]>;
  listExpiredPending(now: Date): Promise<StoredOrder[]>;
};

export class UniqueClientOrderError extends Error {
  readonly code = "23505";

  constructor() {
    super("client order number already exists");
    this.name = "UniqueClientOrderError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  if ("cause" in error) {
    return isUniqueViolation(error.cause);
  }
  return false;
}
