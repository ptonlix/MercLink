import { randomBytes } from "node:crypto";

export const idPrefixes = {
  admin: "adm_",
  merchant: "mch_",
  buyer: "byr_",
  catalog: "cat_",
  field: "fld_",
  revision: "rev_",
  product: "prd_",
  axis: "axs_",
  variant: "var_",
  image: "img_",
  order: "ord_",
  orderLine: "oli_",
  payment: "pay_",
  receipt: "rcp_",
  apiKey: "key_",
  grant: "grn_",
  challenge: "chg_",
  release: "sfr_",
  reset: "srr_",
} as const;

export type IdKind = keyof typeof idPrefixes;

export type IdPrefix = (typeof idPrefixes)[IdKind];

export function createPublicId(kind: IdKind): string {
  const opaque = randomBytes(16).toString("base64url");
  return `${idPrefixes[kind]}${opaque}`;
}

export function hasIdPrefix(value: string, kind: IdKind): boolean {
  return value.startsWith(idPrefixes[kind]);
}
