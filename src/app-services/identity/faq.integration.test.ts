import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET as publicStoreRoute } from "../../app/api/v1/store/route";
import { PUT as putProfileRoute } from "../../app/api/v1/merchant/profile/route";
import {
  GET as getProductFaqs,
  PUT as putProductFaqs,
} from "../../app/api/v1/catalogs/[id]/products/[product_id]/faqs/route";
import { PUT as putStoreFaqs } from "../../app/api/v1/merchant/faqs/route";
import { createCatalog } from "../catalog/catalogs";
import {
  bindCatalogSql,
  getProduct as getPublicProductRoute,
  getProducts as listPublicProductRoute,
} from "../catalog/http";
import { registerCatalog } from "../catalog/register";
import {
  createProduct,
  publishProduct,
  softDeleteProduct,
  unpublishProduct,
  restoreProduct,
} from "../catalog/products";
import { getPublicProduct, listMerchantProducts, listPublicProducts } from "../catalog/query";
import { merchantActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { resetDefaultCatalog } from "../../shared/seams/default-catalog";
import { resetPublicProducts } from "../../shared/seams/public-products";
import { resetSellableVariants } from "../../shared/seams/sellable-variants";
import { withIdentityDatabase } from "./database";
import { registerMerchantFaqs, resetMerchantFaqStore } from "./faq-http";
import { registerMerchantProfile, resetMerchantProfileStore } from "./profile-http";

const hasDatabase = (process.env.DATABASE_URL ?? "").trim() !== "";

describe.skipIf(!hasDatabase)("merchant faq sql", () => {
  afterEach(() => {
    resetAuthenticator();
    resetMerchantFaqStore();
    resetMerchantProfileStore();
    bindCatalogSql(undefined);
    resetPublicProducts();
    resetDefaultCatalog();
    resetSellableVariants();
  });

  it("creates the table without seed rows and enforces both unique keys", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/db/migrations/018_merchant_faqs.sql"),
      "utf8",
    );
    expect(source).not.toMatch(/INSERT\s+INTO/i);
    expect(source).not.toMatch(/UPDATE\s+/i);
    await withIdentityDatabase(async (sql) => {
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'merchant_faqs'
      `;
      expect(columns.map((column) => column.column_name).sort()).toEqual([
        "id",
        "items",
        "merchant_id",
        "product_id",
        "published",
        "updated_at",
      ]);
      await seedMerchant(sql, "mch_a", "13800000001");
      await seedMerchant(sql, "mch_b", "13800000002");
      await sql`
        INSERT INTO catalogs (id, merchant_id, name)
        VALUES ('cat_a', 'mch_a', '目录')
      `;
      await sql`
        INSERT INTO products (id, catalog_id, title, status, fields, schema_revision)
        VALUES ('prd_a', 'cat_a', '商品', 'off', '{}'::jsonb, 0)
      `;
      await sql`
        INSERT INTO merchant_faqs (id, merchant_id, product_id, published, items)
        VALUES ('faq_store', 'mch_a', NULL, false, '[]'::jsonb)
      `;
      await expect(
        sql`
          INSERT INTO merchant_faqs (id, merchant_id, product_id, published, items)
          VALUES ('faq_store_2', 'mch_a', NULL, false, '[]'::jsonb)
        `,
      ).rejects.toThrow();
      await sql`
        INSERT INTO merchant_faqs (id, merchant_id, product_id, published, items)
        VALUES ('faq_product', 'mch_a', 'prd_a', true, '[{"question":"商品问题","answer":"商品答案"}]'::jsonb)
      `;
      await expect(
        sql`
          INSERT INTO merchant_faqs (id, merchant_id, product_id, published, items)
          VALUES ('faq_product_2', 'mch_a', 'prd_a', false, '[]'::jsonb)
        `,
      ).rejects.toThrow();
      await sql`UPDATE products SET deleted_at = now() WHERE id = 'prd_a'`;
      const kept = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM merchant_faqs WHERE product_id = 'prd_a'
      `;
      expect(kept[0]?.count).toBe("1");
    });
  });

  it("keeps faq rows independent of profile and product publication", async () => {
    await withIdentityDatabase(async (sql) => {
      await seedMerchant(sql, "mch_a", "13800000021", "secret@example.com");
      bindCatalogSql(sql);
      registerCatalog(sql);
      registerMerchantProfile(sql);
      registerMerchantFaqs(sql);
      asMerchant("mch_a");
      const catalog = await createCatalog(sql, "mch_a", { name: "目录", currency: "CNY" });
      expect(catalog.ok).toBe(true);
      if (!catalog.ok) {
        return;
      }
      const created = await createProduct(sql, "mch_a", catalog.value.id, {
        title: "示例商品",
        description: "示例描述",
        price: 100,
        stock: 2,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const productId = created.value.id;
      const saved = await putProductFaqs(
        jsonRequest(`/api/v1/catalogs/${catalog.value.id}/products/${productId}/faqs`, {
          published: true,
          items: [{ question: "只在问答里的句子", answer: "不会被搜索" }],
        }),
        { params: Promise.resolve({ id: catalog.value.id, product_id: productId }) },
      );
      expect(saved.status).toBe(200);
      const before = await faqStamp(sql, productId);

      await publishProduct(sql, "mch_a", catalog.value.id, productId);
      await unpublishProduct(sql, "mch_a", catalog.value.id, productId);
      await publishProduct(sql, "mch_a", catalog.value.id, productId);
      const profile = await putProfileRoute(
        jsonRequest("/api/v1/merchant/profile", {
          display_name: "南风商店",
          summary: "已发布简介",
          website_url: null,
          logo_url: null,
          area_served: null,
          address: null,
          license: null,
          contact: null,
          published: true,
        }),
      );
      expect(profile.status).toBe(200);
      expect(await faqStamp(sql, productId)).toEqual(before);

      const visible = await getPublicProduct(sql, productId);
      expect(visible.ok && visible.value.faqs).toEqual([
        { question: "只在问答里的句子", answer: "不会被搜索" },
      ]);
      const listed = await listPublicProducts(sql, { q: "只在问答里的句子", fieldFilters: [] });
      expect(listed.ok && listed.value.items).toEqual([]);
      const byTitle = await listPublicProducts(sql, { q: "示例商品", fieldFilters: [] });
      expect(byTitle.ok && byTitle.value.items.map((item) => item.id)).toEqual([productId]);
      expect(byTitle.ok && byTitle.value.items[0]).not.toHaveProperty("faqs");
      const merchantList = await listMerchantProducts(sql, "mch_a", catalog.value.id, {});
      expect(JSON.stringify(merchantList)).not.toContain("只在问答里的句子");

      const publicList = await listPublicProductRoute(
        new Request("https://merclink.example/api/v1/products?q=示例商品"),
      );
      const listBody = JSON.stringify(await publicList.json());
      expect(listBody).not.toContain("faqs");
      expect(listBody).not.toContain("只在问答里的句子");
      const detail = await getPublicProductRoute(
        productId,
        new Request(`https://merclink.example/api/v1/products/${productId}`),
      );
      await expect(detail.json()).resolves.toMatchObject({
        code: 200,
        data: { faqs: [{ question: "只在问答里的句子", answer: "不会被搜索" }] },
      });

      await unpublishProduct(sql, "mch_a", catalog.value.id, productId);
      const hidden = await getPublicProduct(sql, productId);
      expect(hidden.ok).toBe(false);
      expect(JSON.stringify(hidden)).not.toContain("只在问答里的句子");
      await publishProduct(sql, "mch_a", catalog.value.id, productId);
      const back = await getPublicProduct(sql, productId);
      expect(back.ok && back.value.faqs?.[0]?.question).toBe("只在问答里的句子");

      await softDeleteProduct(sql, "mch_a", catalog.value.id, productId);
      const deleted = await getProductFaqs(
        jsonRequest(`/api/v1/catalogs/${catalog.value.id}/products/${productId}/faqs`),
        {
          params: Promise.resolve({ id: catalog.value.id, product_id: productId }),
        },
      );
      expect(deleted.status).toBe(404);
      expect(await faqStamp(sql, productId)).toEqual(before);
      await restoreProduct(sql, "mch_a", catalog.value.id, productId);
      const restored = await getProductFaqs(
        jsonRequest(`/api/v1/catalogs/${catalog.value.id}/products/${productId}/faqs`),
        { params: Promise.resolve({ id: catalog.value.id, product_id: productId }) },
      );
      await expect(restored.json()).resolves.toMatchObject({
        data: { published: true, items: [{ question: "只在问答里的句子" }] },
      });

      const filtered = await listPublicProducts(sql, {
        catalogId: catalog.value.id,
        fieldFilters: [{ key: "faqs", op: "eq", raw: "x" }],
      });
      expect(filtered.ok).toBe(false);

      const storeSaved = await putStoreFaqs(
        jsonRequest("/api/v1/merchant/faqs", {
          published: false,
          items: [{ question: "未公开全店", answer: "草稿" }],
        }),
      );
      expect(storeSaved.status).toBe(200);
      const withProfile = await publicStoreRoute();
      const withProfileBody: unknown = await withProfile.json();
      expect(withProfileBody).toMatchObject({
        code: 200,
        data: { display_name: "南风商店", faqs: [] },
      });
      expect(JSON.stringify(withProfileBody)).not.toContain("未公开全店");

      await sql`UPDATE merchant_profiles SET published = false WHERE merchant_id = 'mch_a'`;
      const neither = await publicStoreRoute();
      expect(neither.status).toBe(404);

      await putStoreFaqs(
        jsonRequest("/api/v1/merchant/faqs", {
          published: true,
          items: [{ question: "公开全店", answer: "只有问答" }],
        }),
      );
      const onlyFaqs = await publicStoreRoute();
      const onlyBody: unknown = await onlyFaqs.json();
      expect(onlyFaqs.status).toBe(200);
      expect(onlyBody).toMatchObject({ code: 200, data: { faqs: [{ question: "公开全店" }] } });
      expect(
        isRecord(onlyBody) && isRecord(onlyBody.data) ? Object.keys(onlyBody.data).sort() : [],
      ).toEqual(["faqs"]);
      expect(JSON.stringify(onlyBody)).not.toContain("已发布简介");

      await sql`UPDATE merchants SET status = 'disabled' WHERE id = 'mch_a'`;
      expect((await publicStoreRoute()).status).toBe(404);
      const disabledProduct = await getPublicProduct(sql, productId);
      if (disabledProduct.ok) {
        expect(disabledProduct.value.faqs).toEqual([]);
      }
    });
  });
});

async function seedMerchant(
  sql: Parameters<Parameters<typeof withIdentityDatabase>[0]>[0],
  id: string,
  phone: string,
  email: string | null = null,
): Promise<void> {
  await sql`
    INSERT INTO admins (id, phone, password_hash)
    VALUES ('adm_faq', '13800000000', 'hash')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO merchants (id, name, phone, email, password_hash, status, created_by)
    VALUES (${id}, '账号名', ${phone}, ${email}, 'hash', 'active', 'adm_faq')
  `;
}

async function faqStamp(
  sql: Parameters<Parameters<typeof withIdentityDatabase>[0]>[0],
  productId: string,
): Promise<{ published: boolean; items: unknown; updatedAt: string }> {
  const rows = await sql<{ published: boolean; items: unknown; updatedAt: Date }[]>`
    SELECT published, items, updated_at AS "updatedAt"
    FROM merchant_faqs
    WHERE product_id = ${productId}
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("missing faq row");
  }
  return {
    published: row.published,
    items: row.items,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asMerchant(merchantId: string): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: merchantActor({ merchantId, grantId: "grn_faq", scopes: ["product:write"] }),
  }));
}

function jsonRequest(path: string, body?: unknown): Request {
  return new Request(`https://merclink.example${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      authorization: "Bearer merchant-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
