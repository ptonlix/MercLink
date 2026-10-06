import type { Attrs } from "../../domain/catalog/fields";
import type { CatalogRow, FieldRow, OptionRow, ProductRow, VariantRow } from "./db";
import { readAttrs, readOptionValues, toField } from "./db";

export type CatalogRecord = {
  id: string;
  merchantId: string;
  name: string;
  currency: string;
  schemaRevision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type FieldRecord = ReturnType<typeof toField> & { id: string };

export type VariantRecord = {
  id: string;
  sku: string | null;
  optionValues: Record<string, string>;
  price: number;
  stock: number | null;
  status: "on" | "off";
  cover: string | null;
  deleted: boolean;
};

type OptionRecord = {
  id: string;
  key: string;
  label: string;
  position: number;
};

export type ProductRecord = {
  id: string;
  catalogId: string;
  title: string;
  status: "on" | "off";
  cover: string | null;
  attrs: Attrs;
  schemaRevision: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  options: OptionRecord[];
  variants: VariantRecord[];
};

export function catalogRecord(row: CatalogRow): CatalogRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    currency: row.currency,
    schemaRevision: row.schema_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fieldRecord(row: FieldRow): FieldRecord {
  return { id: row.id, ...toField(row) };
}

export function variantRecord(row: VariantRow): VariantRecord {
  return {
    id: row.id,
    sku: row.sku,
    optionValues: readOptionValues(row.option_values),
    price: row.price,
    stock: row.stock,
    status: row.status === "on" ? "on" : "off",
    cover: row.cover,
    deleted: row.deleted_at !== null,
  };
}

export function productRecord(
  row: ProductRow,
  options: readonly OptionRow[],
  variants: readonly VariantRow[],
): ProductRecord {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    title: row.title,
    status: row.status === "on" ? "on" : "off",
    cover: row.cover,
    attrs: readAttrs(row.attrs),
    schemaRevision: row.schema_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    options: options.map((option) => ({
      id: option.id,
      key: option.key,
      label: option.label,
      position: option.position,
    })),
    variants: variants.map(variantRecord),
  };
}
