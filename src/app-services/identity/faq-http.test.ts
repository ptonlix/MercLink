import { afterEach, describe, expect, it } from "vitest";
import { GET as getStoreFaqs, PUT as putStoreFaqs } from "../../app/api/v1/merchant/faqs/route";
import {
  GET as getProductFaqs,
  PUT as putProductFaqs,
} from "../../app/api/v1/catalogs/[id]/products/[product_id]/faqs/route";
import { GET as publicStoreRoute } from "../../app/api/v1/store/route";
import { buyerActor, merchantActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { bindMerchantFaqStore, resetMerchantFaqStore } from "./faq-http";
import type { MerchantFaqStore, StoredFaqSet } from "./faq-store";
import { bindMerchantProfileStore, resetMerchantProfileStore } from "./profile-http";
import type { MerchantProfileStore } from "./profile-store";

describe("merchant faq http", () => {
  afterEach(() => {
    resetAuthenticator();
    resetMerchantFaqStore();
    resetMerchantProfileStore();
  });

  it("returns an empty draft and keeps an unpublished set off the public store", async () => {
    const memory = memoryFaqs();
    bind(memory);
    asMerchant("mch_a", ["product:read"]);
    const empty = await getStoreFaqs(authed("GET", "/api/v1/merchant/faqs"));
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toMatchObject({
      code: 200,
      data: { published: false, items: [], updated_at: null },
    });

    asMerchant("mch_a", ["product:write"]);
    const saved = await putStoreFaqs(
      authed("PUT", "/api/v1/merchant/faqs", {
        published: false,
        items: [{ question: "草稿问题", answer: "草稿答案" }],
      }),
    );
    expect(saved.status).toBe(200);
    const shown = await publicStoreRoute();
    expect(shown.status).toBe(404);
    expect(JSON.stringify(await shown.json())).not.toContain("草稿问题");
  });

  it("rejects a buyer, a missing scope, and an unknown field without writing", async () => {
    const memory = memoryFaqs();
    bind(memory);
    asBuyer();
    const buyer = await putStoreFaqs(
      authed("PUT", "/api/v1/merchant/faqs", { published: false, items: [] }),
    );
    expect(buyer.status).toBe(403);
    await expect(buyer.json()).resolves.toMatchObject({ code: 40300, data: null });

    asMerchant("mch_a", ["product:read"]);
    const missingScope = await putStoreFaqs(
      authed("PUT", "/api/v1/merchant/faqs", { published: false, items: [] }),
    );
    expect(missingScope.status).toBe(403);

    asMerchant("mch_a", ["product:write"]);
    const unknown = await putStoreFaqs(
      authed("PUT", "/api/v1/merchant/faqs", {
        published: true,
        items: [{ question: "问题", answer: "答案" }],
        note: "多余",
      }),
    );
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ code: 40000, data: null });
    expect(memory.writes).toBe(0);

    const emptyPublish = await putStoreFaqs(
      authed("PUT", "/api/v1/merchant/faqs", { published: true, items: [] }),
    );
    expect(emptyPublish.status).toBe(400);
    expect(memory.writes).toBe(0);

    const missingToken = await putStoreFaqs(
      new Request("https://merclink.example/api/v1/merchant/faqs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published: false, items: [] }),
      }),
    );
    expect(missingToken.status).toBe(401);
    await expect(missingToken.json()).resolves.toMatchObject({ code: 40100, data: null });
  });

  it("replaces a product set and hides a missing or soft-deleted product", async () => {
    const memory = memoryFaqs();
    bind(memory);
    asBuyer();
    const buyer = await putProductFaqs(
      authed("PUT", "/api/v1/catalogs/cat_a/products/prd_missing/faqs", {
        published: false,
        items: [],
      }),
      { params: Promise.resolve({ id: "cat_a", product_id: "prd_missing" }) },
    );
    expect(buyer.status).toBe(403);

    asMerchant("mch_a", ["product:write"]);
    const missing = await putProductFaqs(
      authed("PUT", "/api/v1/catalogs/cat_a/products/prd_missing/faqs", {
        published: false,
        items: [],
      }),
      { params: Promise.resolve({ id: "cat_a", product_id: "prd_missing" }) },
    );
    expect(missing.status).toBe(404);
    expect(memory.writes).toBe(0);

    memory.products.add("cat_a:prd_a");
    const wrongCatalog = await putProductFaqs(
      authed("PUT", "/api/v1/catalogs/cat_b/products/prd_a/faqs", {
        published: false,
        items: [],
      }),
      { params: Promise.resolve({ id: "cat_b", product_id: "prd_a" }) },
    );
    expect(wrongCatalog.status).toBe(404);
    expect(memory.writes).toBe(0);

    const saved = await putProductFaqs(
      authed("PUT", "/api/v1/catalogs/cat_a/products/prd_a/faqs", {
        published: true,
        items: [{ question: "商品问题", answer: "商品答案" }],
      }),
      { params: Promise.resolve({ id: "cat_a", product_id: "prd_a" }) },
    );
    expect(saved.status).toBe(200);
    memory.products.delete("cat_a:prd_a");
    const hidden = await getProductFaqs(
      authed("GET", "/api/v1/catalogs/cat_a/products/prd_a/faqs"),
      {
        params: Promise.resolve({ id: "cat_a", product_id: "prd_a" }),
      },
    );
    expect(hidden.status).toBe(404);
    expect(memory.productRow?.items[0]?.question).toBe("商品问题");
    expect(memory.productRow?.published).toBe(true);

    memory.products.add("cat_a:prd_a");
    const restored = await getProductFaqs(
      authed("GET", "/api/v1/catalogs/cat_a/products/prd_a/faqs"),
      { params: Promise.resolve({ id: "cat_a", product_id: "prd_a" }) },
    );
    await expect(restored.json()).resolves.toMatchObject({
      code: 200,
      data: {
        published: true,
        items: [{ question: "商品问题", answer: "商品答案" }],
      },
    });
  });
});

function bind(memory: ReturnType<typeof memoryFaqs>): void {
  bindMerchantProfileStore(emptyProfileStore());
  bindMerchantFaqStore(memory.store);
}

function asMerchant(merchantId: string, scopes: readonly string[]): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: merchantActor({ merchantId, grantId: "grn_m", scopes }),
  }));
}

function asBuyer(): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: buyerActor({ buyerId: "byr_1", grantId: "grn_b", scopes: ["order:read"] }),
  }));
}

function authed(method: "GET" | "PUT", path: string, body?: unknown): Request {
  return new Request(`https://merclink.example${path}`, {
    method,
    headers: {
      authorization: "Bearer merchant-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function emptyProfileStore(): MerchantProfileStore {
  return {
    readOwn: () => Promise.resolve(null),
    replace: () => Promise.reject(new Error("profile replace is not used")),
    readPublished: () => Promise.resolve(null),
    ownedImages: () => Promise.resolve([]),
    secrets: () => Promise.resolve({ phone: "13800138000", email: null }),
  };
}

function memoryFaqs(): {
  store: MerchantFaqStore;
  writes: number;
  products: Set<string>;
  productRow: StoredFaqSet | null;
} {
  const state: {
    writes: number;
    products: Set<string>;
    storeRow: StoredFaqSet | null;
    productRow: StoredFaqSet | null;
    publicItems: { question: string; answer: string }[];
  } = {
    writes: 0,
    products: new Set<string>(),
    storeRow: null,
    productRow: null,
    publicItems: [],
  };
  const store: MerchantFaqStore = {
    readStore: () => Promise.resolve(state.storeRow),
    replaceStore: (_merchantId, draft) => {
      state.writes += 1;
      state.storeRow = { ...draft, updatedAt: new Date("2026-10-19T00:00:00.000Z") };
      state.publicItems = draft.published ? [...draft.items] : [];
      return Promise.resolve(state.storeRow);
    },
    readProduct: (_merchantId, catalogId, productId) => {
      if (!state.products.has(`${catalogId}:${productId}`)) {
        return Promise.resolve({ found: false });
      }
      return Promise.resolve({ found: true, set: state.productRow });
    },
    replaceProduct: (_merchantId, catalogId, productId, draft) => {
      if (!state.products.has(`${catalogId}:${productId}`)) {
        return Promise.resolve({ found: false });
      }
      state.writes += 1;
      state.productRow = { ...draft, updatedAt: new Date("2026-10-19T00:00:00.000Z") };
      return Promise.resolve({ found: true, set: state.productRow });
    },
    secrets: () => Promise.resolve({ phone: "13800138000", email: "secret@example.com" }),
    readPublicStore: () => Promise.resolve(state.publicItems),
  };
  return {
    store,
    get writes() {
      return state.writes;
    },
    products: state.products,
    get productRow() {
      return state.productRow;
    },
  };
}
