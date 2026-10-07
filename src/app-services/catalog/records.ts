import type { Fields } from "../../domain/catalog/fields";
import type { CatalogRow, FieldRow, OptionRow, ProductRow, VariantRow } from "./db";
import { readFields, readOptionValues, toField } from "./db";

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
  fields: Fields;
  schemaRevision: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  axes: OptionRecord[];
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
  axes: readonly OptionRow[],
  variants: readonly VariantRow[],
): ProductRecord {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    title: row.title,
    status: row.status === "on" ? "on" : "off",
    cover: row.cover,
    fields: readFields(row.fields),
    schemaRevision: row.schema_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    axes: axes.map((axis) => ({
      id: axis.id,
      key: axis.key,
      label: axis.label,
      position: axis.position,
    })),
    variants: variants.map(variantRecord),
  };
}
