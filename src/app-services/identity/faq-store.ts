import { randomBytes } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { merchantFaqs } from "../../db/schema/identity";
import type { Sql } from "../../db/client";
import type { FaqDraft, FaqItem } from "../../domain/identity/faqs";
import type { PublicFaqItem } from "../../shared/seams/public-store";

const faqTable = getTableName(merchantFaqs);

export type StoredFaqSet = FaqDraft & {
  updatedAt: Date;
};

type ProductFaqRead = { found: true; set: StoredFaqSet | null } | { found: false };

type SecretRow = {
  phone: string;
  email: string | null;
  deletedAt: Date | null;
};

type FaqRow = {
  published: boolean;
  items: unknown;
  updatedAt: Date | string;
};

export type MerchantFaqStore = {
  readStore: (merchantId: string) => Promise<StoredFaqSet | null>;
  replaceStore: (merchantId: string, draft: FaqDraft) => Promise<StoredFaqSet>;
  readProduct: (
    merchantId: string,
    catalogId: string,
    productId: string,
  ) => Promise<ProductFaqRead>;
  replaceProduct: (
    merchantId: string,
    catalogId: string,
    productId: string,
    draft: FaqDraft,
  ) => Promise<ProductFaqRead>;
  secrets: (merchantId: string) => Promise<{ phone: string; email: string | null } | null>;
  readPublicStore: () => Promise<readonly PublicFaqItem[]>;
};

export function createSqlFaqStore(sql: Sql): MerchantFaqStore {
  return {
    async readStore(merchantId) {
      const rows = await sql<FaqRow[]>`
        SELECT published, items, updated_at AS "updatedAt"
        FROM ${sql(faqTable)}
        WHERE merchant_id = ${merchantId} AND product_id IS NULL
        LIMIT 1
      `;
      const row = rows[0];
      return row === undefined ? null : storedFrom(row);
    },
    async replaceStore(merchantId, draft) {
      const rows = await sql<FaqRow[]>`
        INSERT INTO ${sql(faqTable)} (
          id, merchant_id, product_id, published, items, updated_at
        ) VALUES (
          ${createFaqId()}, ${merchantId}, ${null}, ${draft.published}, ${sql.json(draft.items)}, now()
        )
        ON CONFLICT (merchant_id) WHERE product_id IS NULL
        DO UPDATE SET
          published = EXCLUDED.published,
          items = EXCLUDED.items,
          updated_at = now()
        RETURNING published, items, updated_at AS "updatedAt"
      `;
      const row = rows[0];
      if (row === undefined) {
        throw new Error("merchant faq replace did not return a row");
      }
      return storedFrom(row);
    },
    async readProduct(merchantId, catalogId, productId) {
      if (!(await productIsLive(sql, merchantId, catalogId, productId))) {
        return { found: false };
      }
      const rows = await sql<FaqRow[]>`
        SELECT published, items, updated_at AS "updatedAt"
        FROM ${sql(faqTable)}
        WHERE product_id = ${productId}
        LIMIT 1
      `;
      const row = rows[0];
      return { found: true, set: row === undefined ? null : storedFrom(row) };
    },
    async replaceProduct(merchantId, catalogId, productId, draft) {
      if (!(await productIsLive(sql, merchantId, catalogId, productId))) {
        return { found: false };
      }
      const rows = await sql<FaqRow[]>`
        INSERT INTO ${sql(faqTable)} (
          id, merchant_id, product_id, published, items, updated_at
        ) VALUES (
          ${createFaqId()}, ${merchantId}, ${productId}, ${draft.published},
          ${sql.json(draft.items)}, now()
        )
        ON CONFLICT (product_id)
        DO UPDATE SET
          published = EXCLUDED.published,
          items = EXCLUDED.items,
          updated_at = now()
        RETURNING published, items, updated_at AS "updatedAt"
      `;
      const row = rows[0];
      if (row === undefined) {
        throw new Error("product faq replace did not return a row");
      }
      return { found: true, set: storedFrom(row) };
    },
    async secrets(merchantId) {
      const rows = await sql<SecretRow[]>`
        SELECT phone, email, deleted_at AS "deletedAt"
        FROM merchants
        WHERE id = ${merchantId}
        LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined || row.deletedAt !== null) {
        return null;
      }
      return { phone: row.phone, email: row.email };
    },
    async readPublicStore() {
      const rows = await sql<{ items: unknown }[]>`
        WITH published_profile AS (
          SELECT p.merchant_id
          FROM merchant_profiles p
          JOIN merchants m ON m.id = p.merchant_id
          WHERE p.published = true
            AND m.status = 'active'
            AND m.deleted_at IS NULL
          ORDER BY p.updated_at DESC, p.merchant_id
          LIMIT 1
        )
        SELECT f.items
        FROM ${sql(faqTable)} f
        JOIN merchants m ON m.id = f.merchant_id
        WHERE f.product_id IS NULL
          AND f.published = true
          AND jsonb_typeof(f.items) = 'array'
          AND jsonb_array_length(f.items) > 0
          AND m.status = 'active'
          AND m.deleted_at IS NULL
          AND (
            (SELECT merchant_id FROM published_profile) IS NULL
            OR f.merchant_id = (SELECT merchant_id FROM published_profile)
          )
        ORDER BY f.updated_at DESC, f.merchant_id
        LIMIT 1
      `;
      return faqItemsFrom(rows[0]?.items);
    },
  };
}

async function productIsLive(
  sql: Sql,
  merchantId: string,
  catalogId: string,
  productId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT p.id
    FROM products p
    JOIN catalogs c ON c.id = p.catalog_id
    WHERE p.id = ${productId}
      AND c.id = ${catalogId}
      AND c.merchant_id = ${merchantId}
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] !== undefined;
}

function storedFrom(row: FaqRow): StoredFaqSet {
  return {
    published: row.published,
    items: faqItemsFrom(row.items),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function faqItemsFrom(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: FaqItem[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as { question?: unknown; answer?: unknown };
    if (typeof record.question === "string" && typeof record.answer === "string") {
      items.push({ question: record.question, answer: record.answer });
    }
  }
  return items;
}

function createFaqId(): string {
  return `faq_${randomBytes(16).toString("base64url")}`;
}
