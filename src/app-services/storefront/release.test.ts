import { spawn } from "node:child_process";
import { mkdtemp, cp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { apiRoutes } from "../../shared/api-routes";
import { businessCode, httpStatusFor } from "../../shared/errors";
import { buyerActor, merchantActor } from "../../shared/actor";
import { getDatabase } from "../../db/client";
import { resetCommerceRuntime, useCommerceRuntime } from "../commerce/runtime";
import type { CommerceRepository, StoredGraph } from "../commerce/repository";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { minorUnits } from "../../shared/money";
import {
  publicProducts,
  resetPublicProducts,
  type PublicProduct,
} from "../../shared/seams/public-products";
import { publicStore, resetPublicStore } from "../../shared/seams/public-store";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";
import { systemClock } from "../../ports/clock";
import { maxStorefrontBytes } from "../../domain/storefront/limits";
import { storefrontRewritePath } from "../../domain/storefront/paths";
import {
  getStorefrontSource,
  postStorefrontActivate,
  postStorefrontRelease,
  postStorefrontRollback,
} from "./http";
import { bindStorefrontRuntime, resetStorefrontRuntime } from "./runtime";
import {
  serveStorefront,
  shouldRewriteToRelease,
  storefrontAuthorizeTarget,
  visibleSitemapEntries,
} from "./serve";
import { readStorefrontOrderStatus } from "./order-status";
import { packShippedSource } from "./source";
import { createMemoryStore } from "./store";
import { unzip, zipStore } from "./zip";

const origin = "https://merclink.example";

describe("storefront release", () => {
  afterEach(() => {
    resetAuthenticator();
    resetStorefrontRuntime();
    resetCommerceRuntime();
    resetPublicProducts();
    resetPublicStore();
  });

  it("keeps the built-in page when no release is active and does not execute uploads", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter());
    expect(await serveStorefront("/", `${origin}/`)).toBeNull();
    expect(storefrontRewritePath("/oauth/device/auth", true)).toBeNull();
    expect(storefrontRewritePath("/api/v1/payments/alipay/notify", true)).toBeNull();
    const source = await readFile("src/app-services/storefront/release.ts", "utf8");
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("process.exit");
    expect(source).not.toContain("npm install");
    expect(apiRoutes.some((route) => /return|callback/i.test(route.path))).toBe(false);
    expect(apiRoutes.some((route) => route.path === "/api/v1/payments/alipay/notify")).toBe(true);
    const prd = await readFile("docs/PRD.md", "utf8");
    expect(prd).toContain("允许这一家店替换店面");
    expect(prd).toContain("多店");
    expect(prd).toContain("主题市场");
    expect(prd).not.toContain("不做独立站装修、主题、购物车页面、营销页。");
  });

  it("downloads the shipped source first and the accepted source after upload", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter());
    asMerchant(["storefront:write"]);
    const first = await getStorefrontSource(authed("GET", "/api/v1/storefront/source"));
    expect(first.status).toBe(200);
    const shipped = new Uint8Array(await first.arrayBuffer());
    const entries = unzip(shipped);
    expect(entries.ok).toBe(true);
    if (entries.ok) {
      const names = entries.entries.map((entry) => entry.name);
      expect(names).toContain("accept.mjs");
      expect(names.some((name) => name.includes("/admin/") || name.startsWith("admin/"))).toBe(
        false,
      );
      expect(names.some((name) => name.includes(".env"))).toBe(false);
      const joined = entries.entries
        .map((entry) => new TextDecoder().decode(entry.bytes))
        .join("\n");
      expect(joined).not.toContain("ADMIN_PASSWORD");
      expect(joined).not.toContain("DATABASE_URL=");
    }
    const marker = zipStore([{ name: "marker.txt", bytes: text("accepted-source-marker") }]);
    const created = await postStorefrontRelease(
      uploadRequest(marker, zipStore([{ name: "index.html", bytes: text("<p>CUSTOM-HOME</p>") }])),
    );
    expect(created.status).toBe(201);
    expect(store.pointer.activeId).toBeNull();
    const second = await getStorefrontSource(authed("GET", "/api/v1/storefront/source"));
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(marker);
  });

  it("rejects reserved paths, secrets, missing index, and oversized uploads without moving the pointer", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter());
    asMerchant(["storefront:write"]);
    const reserved = await postStorefrontRelease(
      uploadRequest(
        zipStore([{ name: "source.txt", bytes: text("src") }]),
        zipStore([
          { name: "api/hack.html", bytes: text("<p></p>") },
          { name: "index.html", bytes: text("<p></p>") },
        ]),
      ),
    );
    expect(reserved.status).toBe(httpStatusFor("validation_error"));
    await expect(reserved.json()).resolves.toMatchObject({
      code: businessCode("validation_error"),
    });
    const secret = await postStorefrontRelease(
      uploadRequest(zipStore([{ name: ".env", bytes: text("TOKEN=1") }]), validStaticZip()),
    );
    expect(secret.status).toBe(httpStatusFor("validation_error"));
    const missing = await postStorefrontRelease(
      uploadRequest(
        zipStore([{ name: "readme.txt", bytes: text("src") }]),
        zipStore([{ name: "about.html", bytes: text("<p></p>") }]),
      ),
    );
    expect(missing.status).toBe(httpStatusFor("validation_error"));
    const oversized = await postStorefrontRelease(
      uploadRequest(new Uint8Array(maxStorefrontBytes + 1), validStaticZip()),
    );
    expect(oversized.status).toBe(httpStatusFor("validation_error"));
    expect(store.releases).toHaveLength(0);
    expect(store.pointer.activeId).toBeNull();
    expect(storage.puts).toHaveLength(0);
  });

  it("rate limits uploads and reports storage outages without activating", async () => {
    const limitedStore = createMemoryStore();
    const limitedStorage = memoryStorage();
    bind(limitedStore, limitedStorage.port, {
      reserve: () => Promise.resolve({ ok: false, error: "limited", policy: "storefront-upload" }),
      release: () => Promise.resolve({ ok: true }),
    });
    asMerchant(["storefront:write"]);
    const limited = await postStorefrontRelease(uploadRequest(sourceZip(), validStaticZip()));
    expect(limited.status).toBe(httpStatusFor("rate_limited"));
    await expect(limited.json()).resolves.toMatchObject({ code: businessCode("rate_limited") });
    expect(limitedStorage.puts).toHaveLength(0);
    expect(limitedStore.pointer.activeId).toBeNull();

    const downStore = createMemoryStore();
    bind(downStore, throwingStorage(), allowLimiter());
    const down = await postStorefrontRelease(uploadRequest(sourceZip(), validStaticZip()));
    expect(down.status).toBe(httpStatusFor("dependency_unavailable"));
    await expect(down.json()).resolves.toMatchObject({
      code: businessCode("dependency_unavailable"),
    });
    expect(downStore.releases).toHaveLength(0);
    expect(downStore.pointer.activeId).toBeNull();
  });

  it("forbids product:write and requires confirm before switching the pointer", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter());
    asMerchant(["product:write"]);
    const denied = await getStorefrontSource(authed("GET", "/api/v1/storefront/source"));
    expect(denied.status).toBe(httpStatusFor("forbidden"));
    await expect(denied.json()).resolves.toMatchObject({ code: businessCode("forbidden") });
    const deniedUpload = await postStorefrontRelease(uploadRequest(sourceZip(), validStaticZip()));
    expect(deniedUpload.status).toBe(httpStatusFor("forbidden"));

    asMerchant(["storefront:write"]);
    const created = await postStorefrontRelease(
      uploadRequest(sourceZip(), validStaticZip("CUSTOM-HOME")),
    );
    const body = (await created.json()) as { data: { id: string; active: boolean } };
    expect(body.data.active).toBe(false);
    expect(await serveStorefront("/", `${origin}/`)).toBeNull();
    const unconfirmed = await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${body.data.id}/activate`, {}),
      body.data.id,
    );
    expect(unconfirmed.status).toBe(httpStatusFor("validation_error"));
    expect(store.pointer.activeId).toBeNull();
    const hardcoded = await postStorefrontRelease(
      uploadRequest(
        sourceZip(),
        zipStore([
          { name: "index.html", bytes: text("<p>¥12.00</p>") },
          { name: "products/index.html", bytes: text(productDocument()) },
          { name: "products/item.html", bytes: text(productDocument()) },
        ]),
      ),
    );
    const hardcodedBody = (await hardcoded.json()) as { data: { id: string } };
    const blocked = await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${hardcodedBody.data.id}/activate`, {
        confirm: true,
      }),
      hardcodedBody.data.id,
    );
    expect(blocked.status).toBe(httpStatusFor("validation_error"));
    expect(store.pointer.activeId).toBeNull();
    const activated = await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${body.data.id}/activate`, { confirm: true }),
      body.data.id,
    );
    expect(activated.status).toBe(200);
    expect(store.pointer.activeId).toBe(body.data.id);
    const home = await serveStorefront("/", `${origin}/`);
    expect(await home?.text()).toContain("CUSTOM-HOME");
    const rolled = await postStorefrontRollback(authed("POST", "/api/v1/storefront/rollback"));
    expect(rolled.status).toBe(200);
    expect(store.pointer.activeId).toBeNull();
    expect(await serveStorefront("/", `${origin}/`)).toBeNull();
  });

  it("renders current facts, hides unpublished products, and does not fall back product paths", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter(), readStorefrontOrderStatus);
    asMerchant(["storefront:write"]);
    const created = await postStorefrontRelease(
      uploadRequest(
        sourceZip(),
        zipStore([
          {
            name: "index.html",
            bytes: text(
              `<p>CUSTOM-HOME</p><p><merclink-slot name="store.summary"></merclink-slot></p>`,
            ),
          },
          {
            name: "products/index.html",
            bytes: text(productListDocument()),
          },
          { name: "products/item.html", bytes: text(productDocument()) },
          {
            name: "pay/result.html",
            bytes: text(
              `<p><merclink-slot name="order.status"></merclink-slot></p><template data-merclink="order.paid">支付已完成</template>`,
            ),
          },
          { name: "products/prd_hidden.html", bytes: text("<p>OLD-HIDDEN</p>") },
        ]),
      ),
    );
    const releaseId = ((await created.json()) as { data: { id: string } }).data.id;
    await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${releaseId}/activate`, { confirm: true }),
      releaseId,
    );
    publicStore.register({
      get: () =>
        Promise.resolve({
          displayName: "南风",
          summary: "旧介绍",
          websiteUrl: null,
          logoUrl: null,
          areaServed: null,
          address: null,
        }),
    });
    let price = 159900;
    publicProducts.register({
      list: () => Promise.resolve({ items: [product("prd_1", price)], nextCursor: null }),
      get: (id) =>
        id === "prd_1"
          ? Promise.resolve({ ok: true, product: product("prd_1", price) })
          : Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const before = await serveStorefront("/products/prd_1", `${origin}/products/prd_1`);
    const beforeText = await before?.text();
    expect(beforeText).toContain("¥1599.00");
    expect(beforeText).toContain("南风鞋");
    price = 800;
    publicStore.register({
      get: () =>
        Promise.resolve({
          displayName: "南风",
          summary: "新介绍",
          websiteUrl: null,
          logoUrl: null,
          areaServed: null,
          address: null,
        }),
    });
    const after = await serveStorefront("/products/prd_1", `${origin}/products/prd_1`);
    const afterText = await after?.text();
    expect(afterText).toContain("¥8.00");
    expect(afterText).not.toContain("¥1599.00");
    const home = await serveStorefront("/", `${origin}/`);
    const homeText = await home?.text();
    expect(homeText).toContain("新介绍");
    expect(homeText).toContain("CUSTOM-HOME");
    storage.opens.length = 0;
    const hidden = await serveStorefront("/products/prd_hidden", `${origin}/products/prd_hidden`);
    const hiddenText = await hidden?.text();
    expect(hidden?.status).toBe(404);
    expect(hidden?.headers.get("x-robots-tag")).toContain("noindex");
    expect(hiddenText).toBe("没有找到。");
    expect(hiddenText).not.toContain("OLD-HIDDEN");
    expect(storage.opens.some((key) => key.includes("prd_hidden"))).toBe(false);
    const missing = await serveStorefront("/missing", `${origin}/missing`);
    expect(missing?.status).toBe(404);
    const fallbackRelease = store.releases[0];
    if (fallbackRelease !== undefined) {
      fallbackRelease.fallback = "index.html";
    }
    const fallback = await serveStorefront("/missing", `${origin}/missing`);
    expect(await fallback?.text()).toContain("CUSTOM-HOME");
    const productFallback = await serveStorefront(
      "/products/prd_missing",
      `${origin}/products/prd_missing`,
    );
    expect(productFallback?.status).toBe(404);
    expect(await productFallback?.text()).not.toContain("CUSTOM-HOME");
    useCommerceRuntime(orderRuntime());
    registerAuthenticator((request) => buyerAuth(request));
    const anonymous = await serveStorefront(
      "/pay/result.html",
      `${origin}/pay/result.html?order_id=ord_paid`,
    );
    const owned = await serveStorefront(
      "/pay/result.html",
      `${origin}/pay/result.html?order_id=ord_paid`,
      orderRequest("ord_paid", "Bearer owner"),
    );
    const other = await serveStorefront(
      "/pay/result.html",
      `${origin}/pay/result.html?order_id=ord_paid`,
      orderRequest("ord_paid", "Bearer other"),
    );
    const unread = await serveStorefront(
      "/pay/result.html",
      `${origin}/pay/result.html?order_id=ord_paid`,
      orderRequest("ord_paid", "Bearer noread"),
    );
    const unpaid = await serveStorefront(
      "/pay/result.html",
      `${origin}/pay/result.html?order_id=ord_wait`,
      orderRequest("ord_wait", "Bearer owner"),
    );
    const anonymousText = await anonymous?.text();
    const ownedText = await owned?.text();
    const otherText = await other?.text();
    const unreadText = await unread?.text();
    const unpaidText = await unpaid?.text();
    expect(anonymousText).not.toContain("支付已完成");
    expect(anonymousText).not.toContain("paid");
    expect(ownedText).toContain("支付已完成");
    expect(ownedText).toContain("paid");
    expect(otherText).not.toContain("支付已完成");
    expect(otherText).not.toContain("paid");
    expect(unreadText).not.toContain("支付已完成");
    expect(unpaidText).not.toContain("支付已完成");
    publicProducts.register({
      list: () => Promise.resolve({ items: [product("prd_1", 800)], nextCursor: "page-2" }),
      get: (id) =>
        id === "prd_1"
          ? Promise.resolve({ ok: true, product: product("prd_1", 800) })
          : Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const nextPage = await serveStorefront("/products", `${origin}/products`);
    const nextText = await nextPage?.text();
    expect(nextText).toContain('href="/products?cursor=page-2"');
    expect(nextText).toContain("下一页商品");
    expect(nextText).not.toContain("prd_2");
    publicProducts.register({
      list: () => Promise.resolve({ items: [product("prd_1", 800)], nextCursor: null }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const lastPage = await serveStorefront("/products", `${origin}/products`);
    const lastText = await lastPage?.text();
    expect(lastText).not.toContain("products.next");
    expect(lastText).not.toContain("cursor=");
    const release = store.releases[0];
    if (release !== undefined) {
      release.authorizeBuyer = "account/missing.html";
      expect(await storefrontAuthorizeTarget("buyer")).toBeNull();
      release.authorizeBuyer = "pay/result.html";
      expect(await storefrontAuthorizeTarget("buyer")).toBe("/pay/result.html");
      release.authorizeBuyer = null;
    }
    store.files.splice(
      0,
      store.files.length,
      ...store.files.filter((file) => file.path !== "products/item.html"),
    );
    if (store.releases[0] !== undefined) {
      store.releases[0].fallback = "index.html";
    }
    const listed = await visibleSitemapEntries([
      { url: `${origin}/products/prd_1` },
      { url: `${origin}/` },
    ]);
    expect(listed.map((entry) => entry.url)).not.toContain(`${origin}/products/prd_1`);
    expect(listed.map((entry) => entry.url)).toContain(`${origin}/`);
    expect(await storefrontAuthorizeTarget("buyer")).toBeNull();
  });
});

describe("storefront acceptance command", () => {
  it("fails reserved paths, alipay passwords, unpaid success, and hardcoded or slotless facts", async () => {
    const good = await runAccept(path.join(process.cwd(), "storefront/static"));
    expect(good.code).toBe(0);
    const shipped = unzip(await packShippedSource());
    expect(shipped.ok).toBe(true);
    if (shipped.ok) {
      expect(shipped.entries.some((entry) => entry.name === "accept.mjs")).toBe(true);
    }
    await expect(mutated("api/hack.html", "<p></p>")).resolves.toContain("reserved_path");
    await expect(
      mutated("account/password.html", '<label>支付宝密码</label><input type="password">'),
    ).resolves.toContain("alipay_password");
    await expect(mutated("pay/bad.html", "<p>支付成功</p>")).resolves.toContain("payment_success");
    await expect(mutated("index.html", "<p>店名：南风</p><p>¥12.00</p>")).resolves.toContain(
      "hardcoded_fact",
    );
    await expect(mutated("products/item.html", "<p>商品</p>")).resolves.toContain("missing_slot");
    await expect(mutated("index.html", "<p>售价 1599.00</p>")).resolves.toContain("hardcoded_fact");
    await expect(mutated("products/index.html", "<p>商品</p>")).resolves.toContain("missing_slot");
    await expect(mutated("credentials.json", "{}")).resolves.toContain("reserved_path");
    await expect(mutated("id_rsa", "private")).resolves.toContain("reserved_path");
    await expect(mutated("id_rsa.pub", "public")).resolves.toContain("reserved_path");
    await expect(mutated(".env.local", "TOKEN=1")).resolves.toContain("reserved_path");
    await expect(mutated("keys/pay.pem", "pem")).resolves.toContain("reserved_path");
    await expect(mutated("keys/pay.key", "key")).resolves.toContain("reserved_path");
  });
});

describe("storefront pointer and upload guards", () => {
  afterEach(() => {
    resetStorefrontRuntime();
    resetAuthenticator();
  });

  it("returns 503 when the pointer cannot be read and keeps built-in pages without a database", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    resetStorefrontRuntime();
    try {
      expect(await shouldRewriteToRelease("/")).toBe(false);
      expect(await serveStorefront("/", `${origin}/`)).toBeNull();
    } finally {
      restoreDatabaseUrl(previous);
    }

    const store = createMemoryStore();
    store.readPointer = () => Promise.reject(new Error("db down"));
    bind(store, memoryStorage().port, allowLimiter());
    expect(await shouldRewriteToRelease("/")).toBe(true);
    expect(await shouldRewriteToRelease("/api/v1/storefront/releases")).toBe(false);
    const failed = await serveStorefront("/", `${origin}/`);
    expect(failed?.status).toBe(503);
    expect(await failed?.text()).toBe("没有找到。");
    expect(failed?.headers.get("x-robots-tag")).toContain("noindex");

    const badUrl = "postgres://127.0.0.1:1/merclink-storefront-pointer";
    process.env.DATABASE_URL = badUrl;
    resetStorefrontRuntime();
    try {
      expect(await shouldRewriteToRelease("/")).toBe(true);
      const queried = await serveStorefront("/", `${origin}/`);
      expect(queried?.status).toBe(503);
      expect(await queried?.text()).toBe("没有找到。");
    } finally {
      await getDatabase(badUrl)
        .close()
        .catch(() => undefined);
      restoreDatabaseUrl(previous);
    }
  });

  it("rejects a declared-zero zip bomb and does not spend upload quota on validation_error", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    const limiter = countingLimiter();
    bind(store, storage.port, limiter.port);
    asMerchant(["storefront:write"]);
    const bomb = await postStorefrontRelease(
      uploadRequest(sourceZip(), declaredZeroBomb(maxStorefrontBytes + 1)),
    );
    expect(bomb.status).toBe(httpStatusFor("validation_error"));
    await expect(bomb.json()).resolves.toMatchObject({
      code: businessCode("validation_error"),
    });
    expect(store.pointer.activeId).toBeNull();
    expect(store.releases).toHaveLength(0);
    expect(limiter.count).toBe(0);
    expect(unzip(declaredZeroBomb(8 * 1024), 1024)).toMatchObject({ ok: false });

    const missing = await postStorefrontRelease(
      uploadRequest(sourceZip(), zipStore([{ name: "about.html", bytes: text("<p></p>") }])),
    );
    expect(missing.status).toBe(httpStatusFor("validation_error"));
    expect(limiter.count).toBe(0);

    const created = await postStorefrontRelease(uploadRequest(sourceZip(), validStaticZip()));
    expect(created.status).toBe(201);
    expect(limiter.count).toBe(1);
  });

  it("does not activate a selling price or a product list without the next slot", async () => {
    const store = createMemoryStore();
    const storage = memoryStorage();
    bind(store, storage.port, allowLimiter());
    asMerchant(["storefront:write"]);
    const priced = await postStorefrontRelease(
      uploadRequest(
        sourceZip(),
        zipStore([
          { name: "index.html", bytes: text("<p>售价 1599.00</p>") },
          { name: "products/index.html", bytes: text(productListDocument()) },
          { name: "products/item.html", bytes: text(productDocument()) },
        ]),
      ),
    );
    const pricedId = ((await priced.json()) as { data: { id: string } }).data.id;
    const blockedPrice = await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${pricedId}/activate`, { confirm: true }),
      pricedId,
    );
    expect(blockedPrice.status).toBe(httpStatusFor("validation_error"));
    expect(store.pointer.activeId).toBeNull();

    const missingNext = await postStorefrontRelease(
      uploadRequest(
        sourceZip(),
        zipStore([
          { name: "index.html", bytes: text("<p>home</p>") },
          {
            name: "products/index.html",
            bytes: text(`<template data-merclink="product">${productDocument()}</template>`),
          },
          { name: "products/item.html", bytes: text(productDocument()) },
        ]),
      ),
    );
    const missingId = ((await missingNext.json()) as { data: { id: string } }).data.id;
    const blockedNext = await postStorefrontActivate(
      jsonRequest(`/api/v1/storefront/releases/${missingId}/activate`, { confirm: true }),
      missingId,
    );
    expect(blockedNext.status).toBe(httpStatusFor("validation_error"));
    expect(store.pointer.activeId).toBeNull();
  });
});

async function mutated(file: string, body: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "storefront-"));
  await cp(path.join(process.cwd(), "storefront/static"), directory, { recursive: true });
  const target = path.join(directory, file);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  try {
    const result = await runAccept(directory);
    return result.stderr;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runAccept(directory: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(process.cwd(), "storefront/accept.mjs"),
      directory,
    ]);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

function bind(
  store: ReturnType<typeof createMemoryStore>,
  objectStorage: ObjectStoragePort,
  rateLimit: RateLimitPort,
  readOrderStatus: (input: { request: Request; orderId: string }) => Promise<string | null> = () =>
    Promise.resolve(null),
): void {
  bindStorefrontRuntime({
    rateLimit,
    objectStorage,
    clock: systemClock,
    store,
    readOrderStatus,
  });
}

function countingLimiter(): { port: RateLimitPort; count: number } {
  const state = { count: 0 };
  return {
    get count() {
      return state.count;
    },
    port: {
      reserve: () => {
        state.count += 1;
        return Promise.resolve({
          ok: true,
          reservation: { id: "rsv", subject: "mch_1", policies: ["storefront-upload"] },
        });
      },
      release: () => Promise.resolve({ ok: true }),
    },
  };
}

function allowLimiter(): RateLimitPort {
  return {
    reserve: () =>
      Promise.resolve({
        ok: true,
        reservation: { id: "rsv", subject: "mch_1", policies: ["storefront-upload"] },
      }),
    release: () => Promise.resolve({ ok: true }),
  };
}

function asMerchant(scopes: string[]): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: merchantActor({ merchantId: "mch_1", grantId: "grn_1", scopes }),
  }));
}

function authed(method: string, pathname: string): Request {
  return new Request(`${origin}${pathname}`, {
    method,
    headers: { authorization: "Bearer merchant-token" },
  });
}

function uploadRequest(source: Uint8Array, staticArchive: Uint8Array): Request {
  const form = new FormData();
  form.set("source", new File([binaryBody(source)], "source.zip", { type: "application/zip" }));
  form.set(
    "static",
    new File([binaryBody(staticArchive)], "static.zip", { type: "application/zip" }),
  );
  return new Request(`${origin}/api/v1/storefront/releases`, {
    method: "POST",
    headers: { authorization: "Bearer merchant-token" },
    body: form,
  });
}

function jsonRequest(pathname: string, body: unknown): Request {
  return new Request(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      authorization: "Bearer merchant-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function sourceZip(): Uint8Array {
  return zipStore([{ name: "accept.mjs", bytes: text("export {}") }]);
}

function validStaticZip(marker = "home"): Uint8Array {
  return zipStore([
    { name: "index.html", bytes: text(`<p>${marker}</p>`) },
    {
      name: "products/index.html",
      bytes: text(productListDocument()),
    },
    { name: "products/item.html", bytes: text(productDocument()) },
  ]);
}

function productListDocument(): string {
  return `<template data-merclink="product">${productDocument()}</template><merclink-slot name="products.next"></merclink-slot>`;
}

function productDocument(): string {
  return [
    "product.name",
    "product.cover",
    "product.fields",
    "product.variants",
    "product.stock",
    "product.availability",
    "product.price",
  ]
    .map((name) => `<merclink-slot name="${name}"></merclink-slot>`)
    .join("");
}

function product(id: string, price: number): PublicProduct {
  return {
    id,
    catalogId: "cat_1",
    title: "南风鞋",
    cover: null,
    currency: "CNY",
    offer: { price: minorUnits(price), currency: "CNY", availability: "in_stock" },
    fields: { color: "红" },
    variants: [
      {
        id: "var_1",
        price: minorUnits(price),
        currency: "CNY",
        stock: 4,
        availability: "in_stock",
        optionValues: { size: "42" },
        sku: null,
      },
    ],
  };
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function restoreDatabaseUrl(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }
  process.env.DATABASE_URL = previous;
}

function orderRequest(orderId: string, authorization: string): Request {
  return new Request(`${origin}/pay/result.html?order_id=${orderId}`, {
    headers: { authorization },
  });
}

function buyerAuth(
  request: Request,
): { ok: true; actor: ReturnType<typeof buyerActor> } | { ok: false; response: Response } {
  const token = request.headers.get("authorization");
  if (token === "Bearer owner") {
    return {
      ok: true,
      actor: buyerActor({ buyerId: "byr_owner", grantId: "grn_owner", scopes: ["order:read"] }),
    };
  }
  if (token === "Bearer other") {
    return {
      ok: true,
      actor: buyerActor({ buyerId: "byr_other", grantId: "grn_other", scopes: ["order:read"] }),
    };
  }
  if (token === "Bearer noread") {
    return {
      ok: true,
      actor: buyerActor({
        buyerId: "byr_owner",
        grantId: "grn_noread",
        scopes: ["order:write"],
      }),
    };
  }
  return { ok: false, response: new Response(null, { status: 401 }) };
}

function orderRuntime(): Parameters<typeof useCommerceRuntime>[0] {
  const now = new Date("2026-10-09T00:00:00Z");
  const graph = (id: string, status: "paid" | "pending"): StoredGraph => ({
    order: {
      id,
      buyerId: "byr_owner",
      oauthGrantId: "grn_owner",
      clientOrderNo: "c-1",
      currency: "CNY",
      amount: 100,
      status,
      createdAt: now,
      updatedAt: now,
      paidAt: status === "paid" ? now : null,
      expiresAt: now,
    },
    items: [],
    payment: {
      id: "pay_1",
      orderId: id,
      provider: "alipay",
      channel: "desktop",
      providerTradeNo: null,
      actionUrl: null,
      clientAddress: null,
      stockReleaseAt: null,
      status,
      amount: 100,
      currency: "CNY",
      createdAt: now,
      updatedAt: now,
      paidAt: status === "paid" ? now : null,
    },
  });
  return {
    repo: {
      findById: (id: string) =>
        Promise.resolve(
          id === "ord_paid"
            ? graph("ord_paid", "paid")
            : id === "ord_wait"
              ? graph("ord_wait", "pending")
              : null,
        ),
      findReceipt: () => Promise.resolve(null),
    } as unknown as CommerceRepository,
    payment: {
      upstreamClose: "supported",
      createPayment: () => Promise.reject(new Error("unused")),
      queryPayment: () =>
        Promise.resolve({
          ok: false,
          error: "dependency_unavailable",
          message: "支付网关不可用。",
        }),
      cancelPayment: () => Promise.reject(new Error("unused")),
      verifyNotification: () => Promise.reject(new Error("unused")),
    },
    clock: systemClock,
    ownedCatalogs: () => [],
  };
}

function declaredZeroBomb(uncompressed: number): Uint8Array {
  const payload = new Uint8Array(uncompressed);
  const compressed = deflateRawSync(payload);
  const name = new TextEncoder().encode("bomb.html");
  const crc = crc32(payload) >>> 0;
  const local = new Uint8Array(30 + name.length + compressed.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0x800, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, compressed.length, true);
  localView.setUint32(22, 0, true);
  localView.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(compressed, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x800, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, compressed.length, true);
  centralView.setUint32(24, 0, true);
  centralView.setUint16(28, name.length, true);
  centralView.setUint32(42, 0, true);
  central.set(name, 46);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(eocd, local.length + central.length);
  return out;
}

function binaryBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function memoryStorage(): {
  port: ObjectStoragePort;
  puts: string[];
  opens: string[];
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>();
  const puts: string[] = [];
  const opens: string[] = [];
  return {
    puts,
    opens,
    objects,
    port: {
      put(input) {
        puts.push(input.key);
        objects.set(input.key, input.bytes);
        return Promise.resolve();
      },
      open(key) {
        opens.push(key);
        const bytes = objects.get(key);
        return Promise.resolve(
          bytes === undefined ? null : { bytes, contentType: "application/octet-stream" },
        );
      },
      delete(key) {
        objects.delete(key);
        return Promise.resolve();
      },
      headBucket() {
        return Promise.resolve();
      },
    },
  };
}

function throwingStorage(): ObjectStoragePort {
  return {
    put: () => Promise.reject(new Error("storage down")),
    open: () => Promise.reject(new Error("storage down")),
    delete: () => Promise.resolve(),
    headBucket: () => Promise.reject(new Error("storage down")),
  };
}
