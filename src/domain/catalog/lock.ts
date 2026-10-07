import { minorUnits, type MinorUnits } from "../../shared/money";
import type { Fields } from "./fields";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

export type LockCandidate = {
  variantId: string;
  productId: string;
  catalogId: string;
  title: string;
  currency: string;
  price: number;
  stock: number | null;
  sku: string | null;
  optionValues: Readonly<Record<string, string>>;
  fields: Fields;
  schemaRevision: number;
  variantStatus: "on" | "off";
  productStatus: "on" | "off";
  productDeleted: boolean;
  catalogDeleted: boolean;
  variantDeleted: boolean;
};

export type LockChoice = {
  variantId: string;
  unitPrice: MinorUnits;
  nextStock: number | null;
  line: LockCandidate;
};

export function selectLockTarget(
  candidates: readonly LockCandidate[],
  input: { variantId?: string; productId?: string; qty: number },
): CatalogResult<LockChoice> {
  if (!Number.isSafeInteger(input.qty) || input.qty <= 0) {
    return catalogFail("validation_error", "数量必须是正整数。");
  }
  if (input.variantId === undefined && input.productId === undefined) {
    return catalogFail("validation_error", "必须提供规格或商品。");
  }
  const sellable = candidates.filter(isLockable);
  if (input.variantId !== undefined) {
    const row = candidates.find((candidate) => candidate.variantId === input.variantId);
    if (
      row === undefined ||
      !isLockable(row) ||
      (input.productId !== undefined && row.productId !== input.productId)
    ) {
      return catalogFail("not_found", "没有可售规格。");
    }
    return choose(row, input.qty);
  }
  if (sellable.length === 0) {
    return catalogFail("not_found", "没有可售规格。");
  }
  if (sellable.length > 1) {
    return catalogFail("variant_required", "该商品有多条可售规格，必须指定规格。");
  }
  const only = sellable[0];
  if (only === undefined) {
    return catalogFail("not_found", "没有可售规格。");
  }
  return choose(only, input.qty);
}

export function selectRestoreTarget(
  stock: number | null | undefined,
  qty: number,
): CatalogResult<number | null> {
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    return catalogFail("validation_error", "数量必须是正整数。");
  }
  if (stock === undefined) {
    return catalogFail("not_found", "没有这条规格。");
  }
  if (stock === null) {
    return catalogOk(null);
  }
  return catalogOk(stock + qty);
}

function choose(row: LockCandidate, qty: number): CatalogResult<LockChoice> {
  if (!Number.isSafeInteger(row.price) || row.price < 0) {
    return catalogFail("conflict", "规格价格无效。");
  }
  if (row.stock !== null && row.stock < qty) {
    return catalogFail("insufficient_stock", "库存不足。");
  }
  return catalogOk({
    variantId: row.variantId,
    unitPrice: minorUnits(row.price),
    nextStock: row.stock === null ? null : row.stock - qty,
    line: row,
  });
}

function isLockable(candidate: LockCandidate): boolean {
  return (
    !candidate.variantDeleted &&
    !candidate.productDeleted &&
    !candidate.catalogDeleted &&
    candidate.variantStatus === "on" &&
    candidate.productStatus === "on"
  );
}
