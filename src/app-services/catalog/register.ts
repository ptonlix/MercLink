import { defaultCatalog } from "../../shared/seams/default-catalog";
import { publicProducts } from "../../shared/seams/public-products";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import { createDefaultCatalog } from "./catalogs";
import { catalogTableNames, type Sql } from "./db";
import { asPostgresTx, lockSellable, restoreSellable } from "./lock";
import { getPublicProduct, listPublicProducts } from "./query";

const expectedTables = [
  "catalogs",
  "schema_revisions",
  "product_fields",
  "products",
  "product_axes",
  "variants",
  "product_images",
] as const;

export function registerCatalog(sql: Sql): void {
  if (catalogTableNames.join() !== expectedTables.join()) {
    throw new Error("catalog schema table names drifted");
  }
  publicProducts.register({
    list: async (query) => {
      const page = await listPublicProducts(sql, {
        ...(query.q !== undefined ? { q: query.q } : {}),
        ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        ...(query.catalogId !== undefined ? { catalogId: query.catalogId } : {}),
        ...(query.minPrice !== undefined ? { minPrice: String(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { maxPrice: String(query.maxPrice) } : {}),
        fieldFilters: [],
      });
      if (!page.ok) {
        return { items: [], nextCursor: null };
      }
      return page.value;
    },
    get: async (id) => {
      const product = await getPublicProduct(sql, id);
      if (!product.ok) {
        return { ok: false, error: "not_found", message: product.message };
      }
      return { ok: true, product: product.value };
    },
  });
  sellableVariants.register({
    lock: lockSellable,
    restore: restoreSellable,
  });
  defaultCatalog.register(async (input) => {
    const catalogId = await createDefaultCatalog(asPostgresTx(input.tx), input.merchantId);
    return { status: "created", catalogId };
  });
}
