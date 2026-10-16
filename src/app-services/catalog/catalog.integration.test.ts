import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate";
import { systemClock } from "../../ports/clock";
import type { PaymentPort } from "../../ports/payment";
import { createDrizzleCommerceRepository } from "../commerce/drizzle-store";
import { placeOrder } from "../commerce/place-order";
import { buyerActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { defaultCatalog, resetDefaultCatalog } from "../../shared/seams/default-catalog";
import { publicProducts, resetPublicProducts } from "../../shared/seams/public-products";
import { resetSellableVariants, sellableVariants } from "../../shared/seams/sellable-variants";
import { createCatalog, listCatalogs, readOwnCatalog } from "./catalogs";
import { addField, changeFields, listFields } from "./fields";
import { bindCatalogSql } from "./http";
import { registerCatalog } from "./register";
import {
  createProduct,
  createVariant,
  declareAxis,
  patchProduct,
  patchVariant,
  publishProduct,
  restoreProduct,
  softDeleteProduct,
  softDeleteVariant,
  unpublishProduct,
} from "./products";
import { getPublicProduct, listMerchantProducts, listPublicProducts } from "./query";
import { POST as publishRoute } from "../../app/api/v1/catalogs/[id]/products/[product_id]/publish/route";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl === undefined || configuredDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
}
const databaseUrl: string = configuredDatabaseUrl;

describe("catalog management", () => {
  afterAll(() => {
    resetPublicProducts();
    resetSellableVariants();
    resetDefaultCatalog();
    resetAuthenticator();
    bindCatalogSql(undefined);
  });

  it("migrates the final schema with fields, choices, and axes", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/db/migrations/010_schema.sql"),
      "utf8",
    );
    expect(source).toContain("CREATE TABLE product_axes");
    expect(source).toContain("fields jsonb");
    expect(source).toContain("choices jsonb");
    expect(source).not.toContain("product_options");
    expect(source).not.toContain("RENAME COLUMN");
    await withCatalogDb(async (sql) => {
      const columns = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'products' AND column_name = 'fields')
            OR (table_name = 'variants' AND column_name = 'option_values')
            OR (table_name = 'schema_revisions' AND column_name IN ('before', 'after'))
            OR (table_name = 'product_fields' AND column_name = 'choices')
          )
      `;
      expect(columns.every((column) => column.data_type === "jsonb")).toBe(true);
      expect(columns).toHaveLength(5);
      const retired = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'products' AND column_name = 'attrs')
            OR (table_name = 'product_fields' AND column_name = 'options')
          )
      `;
      expect(retired).toEqual([]);
      const composed = await sql<{ name: string }[]>`
        SELECT con.conname AS name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND con.conname = 'catalogs_merchant_id_fkey'
      `;
      expect(composed.map((row) => row.name)).toEqual(["catalogs_merchant_id_fkey"]);
    });
  });

  it("keeps two catalogs independent and rejects a cross-merchant read", async () => {
    await withCatalogDb(async (sql) => {
      registerCatalog(sql);
      const shoes = await createCatalog(sql, "mch_a", { name: "跑鞋", currency: "CNY" });
      const filters = await createCatalog(sql, "mch_a", { name: "净化器" });
      expect(shoes.ok && filters.ok).toBe(true);
      if (!shoes.ok || !filters.ok) {
        return;
      }
      const listed = await listCatalogs(sql, "mch_a");
      expect(listed.map((catalog) => catalog.name).sort()).toEqual(["净化器", "跑鞋"]);
      const added = await addField(sql, "mch_a", shoes.value.id, {
        key: "weight_g",
        label: "重量",
        type: "number",
        required: false,
      });
      expect(added.ok && added.value.applied).toBe(true);
      const otherFields = await listFields(sql, "mch_a", filters.value.id);
      expect(otherFields.ok && otherFields.value).toEqual([]);
      const cross = await readOwnCatalog(sql, "mch_b", shoes.value.id);
      expect(cross).toMatchObject({ ok: false, error: "not_found" });
      const leaked = await listFields(sql, "mch_b", shoes.value.id);
      expect(leaked).toMatchObject({ ok: false, error: "not_found" });
    });
  });

  it("applies an optional field immediately and previews a breaking change before confirm", async () => {
    await withCatalogDb(async (sql) => {
      const catalog = await mustCatalog(sql);
      const created = await createProduct(sql, "mch_a", catalog.id, {
        title: "示例商品",
        price: 159900,
        stock: 10,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      expect(created.value.status).toBe("off");
      expect(created.value.variants).toHaveLength(1);
      expect(created.value.variants[0]).toMatchObject({ price: 159900, stock: 10, status: "on" });
      const published = await publishProduct(sql, "mch_a", catalog.id, created.value.id);
      expect(published.ok && published.value.status).toBe("on");
      const revisionBefore = catalog.schemaRevision;
      const optional = await addField(sql, "mch_a", catalog.id, {
        key: "weight_g",
        label: "重量",
        type: "number",
        required: false,
      });
      expect(optional.ok && optional.value.applied).toBe(true);
      if (!optional.ok || !optional.value.applied) {
        return;
      }
      expect(optional.value.revision).toBe(revisionBefore + 1);
      const stillOn = await listMerchantProducts(sql, "mch_a", catalog.id, { status: "on" });
      expect(stillOn.ok && stillOn.value.items.map((item) => item.id)).toContain(created.value.id);

      const preview = await changeFields(sql, "mch_a", catalog.id, {
        op: "make_required",
        key: "weight_g",
      });
      expect(preview.ok && !preview.value.applied).toBe(true);
      if (!preview.ok || preview.value.applied) {
        return;
      }
      expect(preview.value.affected.map((item) => item.productId)).toContain(created.value.id);
      const unchanged = await sql<
        { fields: { weight_g?: number }; status: string; schema_revision: number }[]
      >`
        SELECT fields, status, schema_revision FROM products WHERE id = ${created.value.id}
      `;
      expect(unchanged[0]).toMatchObject({ status: "on", fields: {} });
      const revisionRows = await sql<{ revision: number }[]>`
        SELECT revision FROM schema_revisions WHERE catalog_id = ${catalog.id} ORDER BY revision
      `;
      expect(revisionRows.map((row) => row.revision)).toEqual([1]);

      const confirmed = await changeFields(sql, "mch_a", catalog.id, {
        op: "make_required",
        key: "weight_g",
        confirm: true,
      });
      expect(confirmed.ok && confirmed.value.applied).toBe(true);
      if (!confirmed.ok || !confirmed.value.applied) {
        return;
      }
      expect(confirmed.value.affectedCount).toBeGreaterThan(0);
      const after = await sql<{ status: string }[]>`
        SELECT status FROM products WHERE id = ${created.value.id}
      `;
      expect(after[0]?.status).toBe("off");
      const stored = await sql<{ affected_count: number }[]>`
        SELECT affected_count FROM schema_revisions WHERE catalog_id = ${catalog.id} AND revision = ${confirmed.value.revision}
      `;
      expect(stored[0]?.affected_count).toBe(confirmed.value.affectedCount);

      const converted = await createProduct(sql, "mch_a", catalog.id, {
        title: "可转换",
        price: 100,
        stock: 1,
        fields: { weight_g: "480" },
      });
      expect(converted).toMatchObject({ ok: false, error: "validation_error" });
      await changeFields(sql, "mch_a", catalog.id, {
        op: "change_type",
        key: "weight_g",
        type: "text",
        confirm: true,
      });
      const textProduct = await createProduct(sql, "mch_a", catalog.id, {
        title: "文本重量",
        price: 100,
        stock: 1,
        fields: { weight_g: "480" },
      });
      expect(textProduct.ok).toBe(true);
      if (textProduct.ok) {
        await publishProduct(sql, "mch_a", catalog.id, textProduct.value.id);
        const numeric = await changeFields(sql, "mch_a", catalog.id, {
          op: "change_type",
          key: "weight_g",
          type: "number",
          confirm: true,
        });
        expect(numeric.ok && numeric.value.applied).toBe(true);
        const stored = await sql<{ fields: { weight_g?: number }; status: string }[]>`
          SELECT fields, status FROM products WHERE id = ${textProduct.value.id}
        `;
        expect(stored[0]).toMatchObject({ status: "on", fields: { weight_g: 480 } });
      }

      await changeFields(sql, "mch_a", catalog.id, {
        op: "retire",
        key: "weight_g",
        confirm: true,
      });
      const retired = await listPublicProducts(sql, {
        catalogId: catalog.id,
        fieldFilters: [{ key: "weight_g", op: "eq", raw: "1" }],
      });
      expect(retired).toMatchObject({ ok: false, error: "field_retired" });
    });
  });

  it("rejects mixed axes, blocks publish on a sellable default variant, and restores unpublished", async () => {
    await withCatalogDb(async (sql) => {
      const catalog = await mustCatalog(sql);
      const requiredField = await addField(sql, "mch_a", catalog.id, {
        key: "material",
        label: "材质",
        type: "text",
        required: true,
        confirm: true,
      });
      expect(requiredField.ok && requiredField.value.applied).toBe(true);
      const product = await createProduct(sql, "mch_a", catalog.id, {
        title: "跑鞋",
        price: 100,
        stock: 1,
        fields: {},
      });
      expect(product.ok).toBe(true);
      if (!product.ok) {
        return;
      }
      const missing = await publishProduct(sql, "mch_a", catalog.id, product.value.id);
      expect(missing).toMatchObject({ ok: false, error: "validation_error" });
      expect(await reloadStatus(sql, product.value.id)).toBe("off");
      const unknown = await createProduct(sql, "mch_a", catalog.id, {
        title: "坏属性",
        price: 100,
        fields: { nope: "x" },
      });
      expect(unknown).toMatchObject({ ok: false, error: "unknown_field" });
      const priceInAttrs = await createProduct(sql, "mch_a", catalog.id, {
        title: "价格进属性",
        price: 100,
        fields: { price: 1 },
      });
      expect(priceInAttrs).toMatchObject({ ok: false, error: "validation_error" });
      const priced = await createProduct(sql, "mch_a", catalog.id, {
        title: "带价属性",
        price: 10.5,
        fields: { material: "棉" },
      });
      expect(priced).toMatchObject({ ok: false, error: "validation_error" });

      const ready = await createProduct(sql, "mch_a", catalog.id, {
        title: "可上架",
        price: 159900,
        stock: null,
        fields: { material: "棉" },
      });
      expect(ready.ok).toBe(true);
      if (!ready.ok) {
        return;
      }
      expect(ready.value.variants[0]?.stock).toBeNull();
      await declareAxis(sql, "mch_a", catalog.id, ready.value.id, { key: "size", label: "尺码" });
      const sized = await createVariant(sql, "mch_a", catalog.id, ready.value.id, {
        option_values: { size: "40" },
        price: 159900,
        stock: 2,
      });
      const other = await createVariant(sql, "mch_a", catalog.id, ready.value.id, {
        option_values: { size: "42" },
        price: 169900,
        stock: 3,
      });
      const mixed = await createVariant(sql, "mch_a", catalog.id, ready.value.id, {
        option_values: { color: "黑" },
        price: 100,
      });
      expect(sized.ok && other.ok).toBe(true);
      expect(mixed).toMatchObject({ ok: false, error: "conflict" });
      const blocked = await publishProduct(sql, "mch_a", catalog.id, ready.value.id);
      expect(blocked).toMatchObject({ ok: false, error: "conflict" });
      const defaultVariant = ready.value.variants[0];
      expect(defaultVariant).toBeDefined();
      if (defaultVariant === undefined) {
        return;
      }
      await patchVariant(sql, "mch_a", catalog.id, defaultVariant.id, { status: "off" });
      const published = await publishProduct(sql, "mch_a", catalog.id, ready.value.id);
      expect(published.ok && published.value.status).toBe("on");
      if (!sized.ok) {
        return;
      }
      const size40 = sized.value.variants.find((item) => item.optionValues.size === "40");
      expect(size40).toBeDefined();
      if (size40 === undefined) {
        return;
      }
      await patchVariant(sql, "mch_a", catalog.id, size40.id, { status: "off" });
      const stillOn = await listMerchantProducts(sql, "mch_a", catalog.id, { status: "on" });
      expect(stillOn.ok && stillOn.value.items.some((item) => item.id === ready.value.id)).toBe(
        true,
      );

      await unpublishProduct(sql, "mch_a", catalog.id, ready.value.id);
      const hidden = await listPublicProducts(sql, { q: "可上架", fieldFilters: [] });
      expect(hidden.ok && hidden.value.items).toEqual([]);
      const merchantOff = await listMerchantProducts(sql, "mch_a", catalog.id, { status: "off" });
      expect(
        merchantOff.ok && merchantOff.value.items.some((item) => item.id === ready.value.id),
      ).toBe(true);

      await publishProduct(sql, "mch_a", catalog.id, ready.value.id);
      await softDeleteProduct(sql, "mch_a", catalog.id, ready.value.id);
      const gone = await getPublicProduct(sql, ready.value.id);
      expect(gone).toMatchObject({ ok: false, error: "not_found" });
      const rowCount = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM products`;
      const restored = await restoreProduct(sql, "mch_a", catalog.id, ready.value.id);
      expect(restored.ok && restored.value.status).toBe("off");
      expect(restored.ok && restored.value.deletedAt).toBeNull();
      const afterDelete = await sql<
        { count: string }[]
      >`SELECT count(*)::text AS count FROM products`;
      expect(afterDelete[0]?.count).toBe(rowCount[0]?.count);
      const buyerView = await listPublicProducts(sql, { fieldFilters: [] });
      expect(buyerView.ok && buyerView.value.items.some((item) => item.id === ready.value.id)).toBe(
        false,
      );

      const variantId = size40.id;
      await softDeleteVariant(sql, "mch_a", catalog.id, variantId);
      const revived = await patchVariant(sql, "mch_a", catalog.id, variantId, { restore: true });
      expect(revived.ok).toBe(true);
      if (revived.ok) {
        const revivedVariant = revived.value.variants.find((item) => item.id === variantId);
        expect(revivedVariant).toMatchObject({ status: "off", deleted: false });
      }
    });
  });

  it("rejects cross-catalog field filters and does not ignore unknown fields", async () => {
    await withCatalogDb(async (sql) => {
      const catalog = await mustCatalog(sql);
      await addField(sql, "mch_a", catalog.id, {
        key: "weight_g",
        label: "重量",
        type: "number",
        required: false,
      });
      const product = await createProduct(sql, "mch_a", catalog.id, {
        title: "公开鞋",
        price: 500,
        stock: 2,
        fields: { weight_g: 480 },
      });
      expect(product.ok).toBe(true);
      if (!product.ok) {
        return;
      }
      await publishProduct(sql, "mch_a", catalog.id, product.value.id);
      const rejected = await listPublicProducts(sql, {
        fieldFilters: [{ key: "weight_g", op: "lte", raw: "500" }],
      });
      expect(rejected).toMatchObject({ ok: false, error: "validation_error" });
      expect("value" in rejected).toBe(false);
      const unknown = await listPublicProducts(sql, {
        catalogId: catalog.id,
        fieldFilters: [{ key: "not_defined", op: "eq", raw: "1" }],
      });
      expect(unknown).toMatchObject({ ok: false, error: "unknown_field" });
      const found = await listPublicProducts(sql, {
        catalogId: catalog.id,
        fieldFilters: [{ key: "weight_g", op: "lte", raw: "500" }],
      });
      expect(found.ok && found.value.items.map((item) => item.id)).toEqual([product.value.id]);
      const otherMerchant = await listMerchantProducts(sql, "mch_b", catalog.id, {});
      expect(otherMerchant).toMatchObject({ ok: false, error: "not_found" });
      const anonymous = await listPublicProducts(sql, { q: "不存在的下架", fieldFilters: [] });
      expect(anonymous.ok && anonymous.value.items).toEqual([]);
    });
  });

  it("registers public products and locks sellable stock in the caller transaction", async () => {
    await withCatalogDb(async (sql, schema) => {
      registerCatalog(sql);
      const catalog = await mustCatalog(sql);
      const product = await createProduct(sql, "mch_a", catalog.id, {
        title: "锁定鞋",
        price: 159900,
        stock: 4,
      });
      expect(product.ok).toBe(true);
      if (!product.ok) {
        return;
      }
      await declareAxis(sql, "mch_a", catalog.id, product.value.id, {
        key: "size",
        label: "尺码",
      });
      await createVariant(sql, "mch_a", catalog.id, product.value.id, {
        option_values: { size: "40" },
        price: 159900,
        stock: 4,
      });
      await createVariant(sql, "mch_a", catalog.id, product.value.id, {
        option_values: { size: "42" },
        price: 169900,
        stock: 1,
      });
      const defaultVariant = product.value.variants[0];
      expect(defaultVariant).toBeDefined();
      if (defaultVariant === undefined) {
        return;
      }
      await patchVariant(sql, "mch_a", catalog.id, defaultVariant.id, { status: "off" });
      await publishProduct(sql, "mch_a", catalog.id, product.value.id);
      const seam = await publicProducts.list({ q: "锁定鞋" });
      expect(seam.items).toHaveLength(1);
      expect(
        seam.items[0]?.variants.every(
          (variant) => variant.optionValues.size === "40" || variant.optionValues.size === "42",
        ),
      ).toBe(true);
      expect(
        seam.items[0]?.variants.some((variant) => Object.keys(variant.optionValues).length === 0),
      ).toBe(false);
      expect(seam.items[0]?.axisLabels).toEqual({ size: "尺码" });
      const detail = await publicProducts.get(product.value.id);
      expect(detail.ok).toBe(true);
      if (detail.ok) {
        expect(detail.product.variants.every((variant) => variant.id !== defaultVariant.id)).toBe(
          true,
        );
      }

      const required = await sql.begin(async (tx) =>
        sellableVariants.lock({ productId: product.value.id, qty: 1, tx }),
      );
      expect(required).toMatchObject({ ok: false, error: "variant_required" });

      const sellable = seam.items[0]?.variants[0];
      expect(sellable).toBeDefined();
      if (sellable === undefined) {
        return;
      }
      await expect(
        sql.begin(async (tx) => {
          const locked = await sellableVariants.lock({ variantId: sellable.id, qty: 1, tx });
          expect(locked.ok).toBe(true);
          if (locked.ok) {
            expect(locked.line.unitPrice).toBe(sellable.price);
            expect(locked.line.currency).toBe("CNY");
          }
          const other = postgres(databaseUrl, {
            max: 1,
            onnotice: () => undefined,
            connection: { search_path: schema },
          });
          try {
            await expect(
              other`SELECT id FROM variants WHERE id = ${sellable.id} FOR UPDATE NOWAIT`,
            ).rejects.toMatchObject({ code: "55P03" });
          } finally {
            await other.end({ timeout: 5 });
          }
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      const stockAfterRollback = await sql<{ stock: number }[]>`
        SELECT stock FROM variants WHERE id = ${sellable.id}
      `;
      expect(stockAfterRollback[0]?.stock).toBe(sellable.stock);
      const before = stockAfterRollback[0]?.stock;
      await sql.begin(async (tx) => {
        const locked = await sellableVariants.lock({ variantId: sellable.id, qty: 1, tx });
        expect(locked.ok).toBe(true);
      });
      const stockAfterCommit = await sql<{ stock: number }[]>`
        SELECT stock FROM variants WHERE id = ${sellable.id}
      `;
      expect(stockAfterCommit[0]?.stock).toBe((before ?? 0) - 1);
      await sql.begin(async (tx) => {
        const restored = await sellableVariants.restore({ variantId: sellable.id, qty: 1, tx });
        expect(restored).toEqual({ ok: true });
      });

      let createdId = "";
      await expect(
        sql.begin(async (tx) => {
          const created = await defaultCatalog.create({ merchantId: "mch_default", tx });
          expect(created.status).toBe("created");
          if (created.status === "created") {
            createdId = created.catalogId;
            const rows = await tx<{ name: string; currency: string }[]>`
              SELECT name, currency FROM catalogs WHERE id = ${created.catalogId}
            `;
            expect(rows[0]).toEqual({ name: "默认目录", currency: "CNY" });
          }
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      const rolledBack = await sql<
        { id: string }[]
      >`SELECT id FROM catalogs WHERE id = ${createdId}`;
      expect(rolledBack).toEqual([]);
    });
  });

  it("stores an optional description, publishes without one, and searches it without a catalog", async () => {
    await withCatalogDb(async (sql) => {
      const catalog = await mustCatalog(sql);
      const note = await addField(sql, "mch_a", catalog.id, {
        key: "note",
        label: "备注",
        type: "text",
        required: false,
      });
      expect(note.ok && note.value.applied).toBe(true);
      const reserved = await addField(sql, "mch_a", catalog.id, {
        key: "description",
        label: "描述",
        type: "text",
        required: false,
      });
      expect(reserved).toMatchObject({ ok: false, error: "validation_error" });

      const bare = await createProduct(sql, "mch_a", catalog.id, {
        title: "无描述",
        price: 100,
        stock: 1,
      });
      expect(bare.ok).toBe(true);
      if (!bare.ok) {
        return;
      }
      expect(bare.value.description).toBeNull();
      expect(bare.value.fields).not.toHaveProperty("description");
      const publishedBare = await publishProduct(sql, "mch_a", catalog.id, bare.value.id);
      expect(publishedBare.ok && publishedBare.value.status).toBe("on");
      expect(publishedBare.ok && publishedBare.value.description).toBeNull();

      const rejected = await createProduct(sql, "mch_a", catalog.id, {
        title: "放进字段",
        description: "正文",
        price: 100,
        stock: 1,
        fields: { description: "不能放这里" },
      });
      expect(rejected).toMatchObject({ ok: false, error: "validation_error" });
      const absent = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM products WHERE title = '放进字段'
      `;
      expect(absent[0]?.count).toBe("0");

      const pearl = await createProduct(sql, "mch_a", catalog.id, {
        title: "普通鞋",
        description: "  只在描述里的海螺\n第二行  ",
        price: 200,
        stock: 2,
        fields: { note: "没有那个词" },
      });
      expect(pearl.ok).toBe(true);
      if (!pearl.ok) {
        return;
      }
      expect(pearl.value.description).toBe("只在描述里的海螺\n第二行");
      expect(pearl.value.fields).toEqual({ note: "没有那个词" });
      const tooLong = await patchProduct(sql, "mch_a", catalog.id, pearl.value.id, {
        description: "x".repeat(2001),
      });
      expect(tooLong).toMatchObject({ ok: false, error: "validation_error" });
      const inFields = await patchProduct(sql, "mch_a", catalog.id, pearl.value.id, {
        fields: { description: "正文" },
      });
      expect(inFields).toMatchObject({ ok: false, error: "validation_error" });
      const renamed = await patchProduct(sql, "mch_a", catalog.id, pearl.value.id, {
        title: "普通鞋改名",
      });
      expect(renamed.ok && renamed.value.title).toBe("普通鞋改名");
      expect(renamed.ok && renamed.value.description).toBe("只在描述里的海螺\n第二行");
      expect(renamed.ok && renamed.value.fields).toEqual({ note: "没有那个词" });
      await publishProduct(sql, "mch_a", catalog.id, pearl.value.id);

      const other = await createProduct(sql, "mch_a", catalog.id, {
        title: "别的鞋",
        price: 300,
        stock: 1,
        fields: { note: "普通备注" },
      });
      expect(other.ok).toBe(true);
      if (!other.ok) {
        return;
      }
      await publishProduct(sql, "mch_a", catalog.id, other.value.id);

      const found = await listPublicProducts(sql, { q: "海螺", fieldFilters: [] });
      expect(found.ok && found.value.items.map((item) => item.id)).toEqual([pearl.value.id]);
      expect(found.ok && found.value.items[0]?.description).toBe("只在描述里的海螺\n第二行");
      expect(found.ok && found.value.items[0]?.fields).not.toHaveProperty("description");
      const merchant = await listMerchantProducts(sql, "mch_a", catalog.id, {});
      const merchantPearl = merchant.ok
        ? merchant.value.items.find((item) => item.id === pearl.value.id)
        : undefined;
      expect(merchantPearl?.description).toBe("只在描述里的海螺\n第二行");
      const merchantBare = merchant.ok
        ? merchant.value.items.find((item) => item.id === bare.value.id)
        : undefined;
      expect(merchantBare?.description).toBeNull();
      const filtered = await listPublicProducts(sql, {
        fieldFilters: [{ key: "note", op: "eq", raw: "普通备注" }],
      });
      expect(filtered).toMatchObject({ ok: false, error: "validation_error" });

      const cleared = await patchProduct(sql, "mch_a", catalog.id, pearl.value.id, {
        description: null,
      });
      expect(cleared.ok && cleared.value.description).toBeNull();
      expect(cleared.ok && cleared.value.fields).toEqual({ note: "没有那个词" });
      const afterClear = await getPublicProduct(sql, pearl.value.id);
      expect(afterClear.ok && afterClear.value.description).toBeNull();
      expect(afterClear.ok && afterClear.value.fields).not.toHaveProperty("description");
    });
  });

  it("snapshots the ordered description and ignores a later product edit", async () => {
    await withCatalogDb(async (sql, schema) => {
      registerCatalog(sql);
      const catalog = await mustCatalog(sql);
      const created = await createProduct(sql, "mch_a", catalog.id, {
        title: "珍珠",
        description: "海水珍珠",
        price: 100,
        stock: 2,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const variant = created.value.variants[0];
      expect(variant).toBeDefined();
      if (variant === undefined) {
        return;
      }
      expect(await publishProduct(sql, "mch_a", catalog.id, created.value.id)).toMatchObject({
        ok: true,
      });
      const empty = await createProduct(sql, "mch_a", catalog.id, {
        title: "空描述",
        price: 50,
        stock: 1,
      });
      expect(empty.ok).toBe(true);
      if (!empty.ok) {
        return;
      }
      const emptyVariant = empty.value.variants[0];
      expect(emptyVariant).toBeDefined();
      if (emptyVariant === undefined) {
        return;
      }
      expect(await publishProduct(sql, "mch_a", catalog.id, empty.value.id)).toMatchObject({
        ok: true,
      });
      await sql`
        INSERT INTO buyers (id, phone, password_hash)
        VALUES ('byr_desc', '13900000077', 'hash')
      `;
      const commerce = postgres(databaseUrl, {
        max: 1,
        onnotice: () => undefined,
        connection: { search_path: schema },
      });
      try {
        const runtime = {
          repo: createDrizzleCommerceRepository(drizzle(commerce)),
          payment: descriptionPayment(),
          clock: systemClock,
          ownedCatalogs: () => [],
          purchaseEnabled: true,
        };
        const actor = buyerActor({
          buyerId: "byr_desc",
          grantId: "grn_desc",
          scopes: ["order:write", "order:read"],
        });
        const placed = await placeOrder({
          actor,
          body: {
            client_order_no: "pearl-1",
            items: [{ variant_id: variant.id, qty: 1 }],
          },
          runtime,
        });
        expect(placed.ok).toBe(true);
        if (!placed.ok) {
          return;
        }
        const blank = await placeOrder({
          actor,
          body: {
            client_order_no: "blank-1",
            items: [{ variant_id: emptyVariant.id, qty: 1 }],
          },
          runtime,
        });
        expect(blank.ok).toBe(true);
        if (!blank.ok) {
          return;
        }
        const before = await sql<
          {
            id: string;
            description_snapshot: string | null;
            fields_snapshot: Record<string, unknown>;
          }[]
        >`
          SELECT id, description_snapshot, fields_snapshot
          FROM order_items
          WHERE order_id IN (${placed.graph.order.id}, ${blank.graph.order.id})
          ORDER BY description_snapshot NULLS FIRST
        `;
        expect(before.map((row) => row.description_snapshot)).toEqual([null, "海水珍珠"]);
        expect(before.every((row) => !Object.hasOwn(row.fields_snapshot, "description"))).toBe(
          true,
        );
        const patched = await patchProduct(sql, "mch_a", catalog.id, created.value.id, {
          description: "改后的描述",
        });
        expect(patched.ok && patched.value.description).toBe("改后的描述");
        const after = await sql<{ description_snapshot: string | null }[]>`
          SELECT description_snapshot FROM order_items WHERE order_id = ${placed.graph.order.id}
        `;
        expect(after).toEqual([{ description_snapshot: "海水珍珠" }]);
      } finally {
        await commerce.end({ timeout: 5 });
      }
    });
  });

  it("returns 403 when a buyer actor publishes", async () => {
    registerAuthenticator(() => ({
      ok: true,
      actor: buyerActor({
        buyerId: "byr_1",
        grantId: "grn_1",
        scopes: ["order:write", "order:read"],
      }),
    }));
    const response = await publishRoute(
      new Request("https://merclink.example/api/v1/catalogs/cat_1/products/prd_1/publish", {
        method: "POST",
        headers: { authorization: "Bearer buyer-token" },
      }),
      { params: Promise.resolve({ id: "cat_1", product_id: "prd_1" }) },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 40300, data: null });
  });
});

function descriptionPayment(): PaymentPort {
  return {
    upstreamClose: "supported",
    createPayment: (input) =>
      Promise.resolve({
        ok: true,
        action: `https://pay.example/${input.orderId}`,
        providerTradeNo: null,
      }),
    queryPayment: (input) =>
      Promise.resolve({
        ok: true,
        status: "pending",
        providerTradeNo: input.providerTradeNo,
        amount: null,
      }),
    cancelPayment: () => Promise.resolve({ ok: true, outcome: "closed" }),
    verifyNotification: () =>
      Promise.resolve({ ok: false, error: "invalid_signature", message: "验签失败。" }),
  };
}

async function mustCatalog(sql: postgres.Sql) {
  const created = await createCatalog(sql, "mch_a", { name: "跑鞋" });
  if (!created.ok) {
    throw new Error(created.message);
  }
  return created.value;
}

async function reloadStatus(sql: postgres.Sql, productId: string): Promise<string | undefined> {
  const rows = await sql<{ status: string }[]>`SELECT status FROM products WHERE id = ${productId}`;
  return rows[0]?.status;
}

async function withCatalogDb(
  run: (sql: postgres.Sql, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `cat_${randomBytes(4).toString("hex")}`;
  const admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  await admin.end({ timeout: 5 });
  await runMigrations({ databaseUrl, searchPath: schema });
  const sql = postgres(databaseUrl, {
    max: 4,
    onnotice: () => undefined,
    connection: { search_path: schema },
  });
  try {
    await sql`
      INSERT INTO admins (id, phone, password_hash)
      VALUES ('adm_test', '13800000000', 'hash')
    `;
    await sql`
      INSERT INTO merchants (id, name, phone, password_hash, status, created_by)
      VALUES
        ('mch_a', '甲商家', '13800000001', 'hash', 'active', 'adm_test'),
        ('mch_b', '乙商家', '13800000002', 'hash', 'active', 'adm_test'),
        ('mch_not_in_any_table', '孤立商家', '13800000003', 'hash', 'active', 'adm_test'),
        ('mch_default', '默认商家', '13800000004', 'hash', 'active', 'adm_test')
    `;
    await run(sql, schema);
  } finally {
    resetPublicProducts();
    resetSellableVariants();
    resetDefaultCatalog();
    await sql.end({ timeout: 5 });
    const drop = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await drop.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await drop.end({ timeout: 5 });
  }
}
