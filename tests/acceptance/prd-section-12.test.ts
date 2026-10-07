import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GET as health } from "../../src/app/api/health/route";
import { GET as metadata } from "../../src/app/.well-known/oauth-protected-resource/route";
import { GET as buyerSkill } from "../../src/app/agent-docs/buyer-skill/route";
import { GET as merchantSkillRoute } from "../../src/app/agent-docs/merchant-skill/route";
import { POST as placeOrderRoute } from "../../src/app/api/v1/orders/route";
import { GET as publicProductsRoute } from "../../src/app/api/v1/products/route";
import { MerchantAuthorizeView } from "../../src/app/authorize/views";
import { registerSlices } from "../../src/composition/register-all";
import { approveAgent, revokeGrant } from "../../src/app-services/access/grants";
import {
  agentClientId,
  agentRedirectUri,
  startAuthorizationServer,
} from "../../src/app-services/access/provider";
import { bindCatalogSql } from "../../src/app-services/catalog/http";
import { registerCatalog } from "../../src/app-services/catalog/register";
import { createCatalog, listCatalogs } from "../../src/app-services/catalog/catalogs";
import { addField, changeFields, listFields } from "../../src/app-services/catalog/fields";
import {
  createProduct,
  createVariant,
  declareOption,
  publishProduct,
  restoreProduct,
  softDeleteProduct,
  unpublishProduct,
} from "../../src/app-services/catalog/products";
import { getPublicProduct } from "../../src/app-services/catalog/query";
import { createDrizzleCommerceRepository } from "../../src/app-services/commerce/drizzle-store";
import { placeOrder } from "../../src/app-services/commerce/place-order";
import { readBuyerOrder } from "../../src/app-services/commerce/read-order";
import {
  resetCommerceRuntime,
  useCommerceRuntime,
  type CommerceRuntime,
} from "../../src/app-services/commerce/runtime";
import { changeAdminPassword, ensureSuperAdmin } from "../../src/app-services/identity/admin";
import { createMemoryRateLimit } from "../../src/adapters/redis/memory";
import { smsRateLimitPolicies } from "../../src/domain/identity/registration";
import { requestBuyerSms } from "../../src/app-services/identity/buyers";
import { fakeCaptcha, fakeSms } from "../../src/app-services/identity/fakes";
import { provisionMerchant } from "../../src/app-services/identity/merchants";
import { runOnce } from "../../src/jobs/close-expired-orders";
import { runMigrations } from "../../src/db/migrate";
import { loadLanding, loadProduct } from "../../src/public-discovery/model";
import { apiRoutes, routesFor } from "../../src/shared/api-routes";
import { buyerActor, merchantActor } from "../../src/shared/actor";
import { resetAuthenticator } from "../../src/shared/seams/authenticate";
import { resetDefaultCatalog } from "../../src/shared/seams/default-catalog";
import { resetPublicProducts } from "../../src/shared/seams/public-products";
import { resetSellableVariants } from "../../src/shared/seams/sellable-variants";
import type { PaymentPort } from "../../src/ports/payment";
import { systemClock } from "../../src/ports/clock";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://merclink:merclink@127.0.0.1:5432/merclink";

describe("PRD section 12", () => {
  afterAll(() => {
    resetAuthenticator();
    resetDefaultCatalog();
    resetPublicProducts();
    resetSellableVariants();
    resetCommerceRuntime();
    bindCatalogSql(undefined);
  });

  it("serves health, metadata, skills, and the landing page from the composed seams", async () => {
    expect(health().status).toBe(200);
    const meta = metadata(new Request("http://localhost/.well-known/oauth-protected-resource"));
    expect(meta.status).toBe(200);
    expect((await buyerSkill()).status).toBe(200);
    expect((await merchantSkillRoute()).status).toBe(200);
    await withAcceptance(async ({ sql }) => {
      bindCatalogSql(sql);
      const landing = await loadLanding();
      expect(landing.description.length).toBeGreaterThan(0);
    });
  });

  it("keeps route files, the route table, and both skills on the same paths", async () => {
    const buyer = await readFile(path.join(process.cwd(), "src/agent-docs/skill.md"), "utf8");
    const merchant = await readFile(
      path.join(process.cwd(), "src/agent-docs/merchant-skill.md"),
      "utf8",
    );
    for (const route of routesFor("buyer")) {
      expect(buyer).toContain(route.path.replaceAll("{", "{"));
      expect(routeFile(route.path)).toBe(true);
    }
    for (const route of routesFor("merchant")) {
      expect(merchant).toContain(route.path);
    }
    for (const route of apiRoutes) {
      expect(routeFile(route.path)).toBe(true);
    }
    expect(buyer).toContain("payment.action");
    const adapter = await readFile(
      path.join(process.cwd(), "src/adapters/alipay/adapter.ts"),
      "utf8",
    );
    expect(adapter).toContain("pageExecute");
    expect(adapter).toContain("alipayMethods.create");
  });

  it("runs the merchant and buyer loop on one database transaction", async () => {
    await withAcceptance(async ({ sql, db }) => {
      bindCatalogSql(sql);
      registerCatalog(sql);
      const admin = await ensureSuperAdmin(sql, {
        phone: "13800000000",
        password: "initial-admin-password",
      });
      expect(
        await changeAdminPassword(sql, {
          adminId: admin.admin.id,
          currentPassword: "initial-admin-password",
          nextPassword: "changed-admin-password",
        }),
      ).toMatchObject({ ok: true });
      const first = await provisionMerchant(sql, {
        adminId: admin.admin.id,
        name: "跑鞋店",
        phone: "13800000001",
        password: "merchant-password",
      });
      const second = await provisionMerchant(sql, {
        adminId: admin.admin.id,
        name: "净化器店",
        phone: "13800000002",
        password: "merchant-password",
      });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(first.default_catalog).toBe("created");
      const shoes = (await listCatalogs(sql, first.merchantId))[0];
      expect(shoes).toBeDefined();
      if (shoes === undefined) {
        return;
      }
      const extra = await createCatalog(sql, first.merchantId, { name: "第二本目录" });
      expect(extra.ok).toBe(true);
      if (!extra.ok) {
        return;
      }
      const probed = await sql`SELECT ${sql.json({ a: 1 })}::jsonb AS value`;
      if (probed[0]?.value.a !== 1) {
        throw new Error("json probe mismatch");
      }
      const numberField = await addField(sql, first.merchantId, shoes.id, {
        key: "weight_g",
        label: "重量",
        type: "number",
        required: false,
      });
      const selectField = await addField(sql, first.merchantId, shoes.id, {
        key: "color",
        label: "颜色",
        type: "single-select",
        required: false,
        options: ["黑", "白"],
      });
      expect(numberField.ok && selectField.ok).toBe(true);
      const otherFields = await listFields(sql, first.merchantId, extra.value.id);
      expect(otherFields.ok && otherFields.value).toEqual([]);

      const product = await createProduct(sql, first.merchantId, shoes.id, {
        title: "竞速跑鞋",
        price: 159900,
        stock: 4,
      });
      expect(product.ok).toBe(true);
      if (!product.ok) {
        return;
      }
      await declareOption(sql, first.merchantId, shoes.id, product.value.id, {
        key: "size",
        label: "尺码",
      });
      const small = await createVariant(sql, first.merchantId, shoes.id, product.value.id, {
        options: { size: "40" },
        price: 159900,
        stock: 2,
      });
      const large = await createVariant(sql, first.merchantId, shoes.id, product.value.id, {
        options: { size: "42" },
        price: 169900,
        stock: 3,
      });
      expect(small.ok && large.ok).toBe(true);
      if (!small.ok || !large.ok) {
        return;
      }
      const smallVariant = small.value.variants.find((item) => item.optionValues.size === "40");
      const largeVariant = large.value.variants.find((item) => item.optionValues.size === "42");
      if (smallVariant === undefined || largeVariant === undefined) {
        throw new Error("sized variants were not created");
      }
      const defaultVariant = product.value.variants[0];
      expect(defaultVariant).toBeDefined();
      if (defaultVariant === undefined) {
        return;
      }
      await sql`UPDATE variants SET status = 'off' WHERE id = ${defaultVariant.id}`;
      expect(await publishProduct(sql, first.merchantId, shoes.id, product.value.id)).toMatchObject(
        { ok: true },
      );

      const preview = await changeFields(sql, first.merchantId, shoes.id, {
        op: "make_required",
        key: "weight_g",
      });
      expect(preview.ok && preview.value.applied).toBe(false);
      const stillOn = await sql<{ status: string }[]>`
        SELECT status FROM products WHERE id = ${product.value.id}
      `;
      expect(stillOn[0]?.status).toBe("on");

      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      const cancels: string[] = [];
      const payment = fakePayment(cancels);
      const runtime = commerceRuntimeFor(db, sql, payment);
      useCommerceRuntime(runtime);
      try {
        await registerSlices({ sql, provider: started.provider });
        const buyerId = `byr_${randomBytes(4).toString("hex")}`;
        await sql`
          INSERT INTO buyers (id, phone, password_hash, phone_verified_at)
          VALUES (${buyerId}, '13900000001', 'hash', now())
        `;
        const merchantTokens = await issueTokens(started, sql, first.merchantId, "merchant");
        const buyerTokens = await issueTokens(started, sql, buyerId, "buyer");
        const otherBuyer = `byr_${randomBytes(4).toString("hex")}`;
        await sql`
          INSERT INTO buyers (id, phone, password_hash, phone_verified_at)
          VALUES (${otherBuyer}, '13900000002', 'hash', now())
        `;
        const otherTokens = await issueTokens(started, sql, otherBuyer, "buyer");

        const visible = await publicProductsRoute(new Request("http://localhost/api/v1/products"));
        const visibleBody = (await visible.json()) as { items: { id: string }[] };
        expect(visibleBody.items.map((item) => item.id)).toContain(product.value.id);

        const priced = await placeOrderRoute(
          new Request("http://localhost/api/v1/orders", {
            method: "POST",
            headers: { authorization: `Bearer ${buyerTokens.access_token}` },
            body: JSON.stringify({
              client_order_no: "agent-1",
              items: [{ variant_id: smallVariant.id, qty: 1, price: 1 }],
            }),
          }),
        );
        expect(priced.status).toBe(400);

        const tooMany = await placeOrder({
          actor: buyerActor({
            buyerId,
            grantId: buyerTokens.grantId,
            scopes: ["order:write", "order:read"],
          }),
          body: {
            client_order_no: "agent-2",
            items: [
              { variant_id: smallVariant.id, qty: 1 },
              { variant_id: largeVariant.id, qty: 1 },
            ],
          },
          runtime,
        });
        expect(tooMany).toMatchObject({ ok: false, error: "too_many_items" });

        const placed = await placeOrder({
          actor: buyerActor({
            buyerId,
            grantId: buyerTokens.grantId,
            scopes: ["order:write", "order:read"],
          }),
          body: {
            client_order_no: "agent-3",
            items: [{ variant_id: smallVariant.id, qty: 1 }],
          },
          runtime,
        });
        expect(placed.ok).toBe(true);
        if (!placed.ok) {
          return;
        }
        expect(placed.action).toBe(`https://pay.example/${placed.graph.order.id}`);
        const repeated = await placeOrder({
          actor: buyerActor({
            buyerId,
            grantId: buyerTokens.grantId,
            scopes: ["order:write", "order:read"],
          }),
          body: {
            client_order_no: "agent-3",
            items: [{ variant_id: smallVariant.id, qty: 1 }],
          },
          runtime,
        });
        expect(repeated.ok && repeated.graph.order.id).toBe(placed.graph.order.id);
        const stock = await sql<{ stock: number }[]>`
          SELECT stock FROM variants WHERE id = ${smallVariant.id}
        `;
        expect(stock[0]?.stock).toBe(1);
        const otherStock = await sql<{ stock: number }[]>`
          SELECT stock FROM variants WHERE id = ${largeVariant.id}
        `;
        expect(otherStock[0]?.stock).toBe(3);

        const paid = await readBuyerOrder({
          actor: buyerActor({
            buyerId,
            grantId: buyerTokens.grantId,
            scopes: ["order:read"],
          }),
          orderId: placed.graph.order.id,
          runtime: paidRuntime(runtime),
        });
        expect(paid.ok && paid.graph.order.status).toBe("paid");

        const foreignOrder = await readBuyerOrder({
          actor: buyerActor({
            buyerId: otherBuyer,
            grantId: otherTokens.grantId,
            scopes: ["order:read"],
          }),
          orderId: placed.graph.order.id,
          runtime,
        });
        expect(foreignOrder).toMatchObject({ ok: false, error: "not_found" });
        const foreignCatalog = await listCatalogs(sql, second.merchantId);
        expect(foreignCatalog.map((catalog) => catalog.id)).not.toContain(shoes.id);

        const merchantPublish = await publishProduct(
          sql,
          second.merchantId,
          shoes.id,
          product.value.id,
        );
        expect(merchantPublish).toMatchObject({ ok: false });
        expect(
          await placeOrder({
            actor: merchantActor({
              merchantId: first.merchantId,
              grantId: merchantTokens.grantId,
              scopes: ["product:write", "order:read"],
            }),
            body: {
              client_order_no: "merchant-cannot-buy",
              items: [{ variant_id: largeVariant.id, qty: 1 }],
            },
            runtime,
          }),
        ).toMatchObject({ ok: false, error: "forbidden" });

        await unpublishProduct(sql, first.merchantId, shoes.id, product.value.id);
        expect(await getPublicProduct(sql, product.value.id)).toMatchObject({ ok: false });
        const hiddenPage = await loadProduct(product.value.id);
        expect(hiddenPage.kind).toBe("hidden");
        await publishProduct(sql, first.merchantId, shoes.id, product.value.id);

        await softDeleteProduct(sql, first.merchantId, shoes.id, product.value.id);
        expect(await getPublicProduct(sql, product.value.id)).toMatchObject({ ok: false });
        const snapshot = await sql<{ title_snapshot: string }[]>`
          SELECT title_snapshot FROM order_items WHERE order_id = ${placed.graph.order.id}
        `;
        expect(snapshot[0]?.title_snapshot).toBe("竞速跑鞋");
        const restored = await restoreProduct(sql, first.merchantId, shoes.id, product.value.id);
        expect(restored.ok && restored.value.status).toBe("off");
        expect(
          await publishProduct(sql, first.merchantId, shoes.id, product.value.id),
        ).toMatchObject({ ok: true });

        const expiring = await placeOrder({
          actor: buyerActor({
            buyerId,
            grantId: buyerTokens.grantId,
            scopes: ["order:write", "order:read"],
          }),
          body: {
            client_order_no: "agent-expire",
            items: [{ variant_id: largeVariant.id, qty: 1 }],
          },
          runtime,
        });
        expect(expiring.ok).toBe(true);
        if (!expiring.ok) {
          return;
        }
        await runOnce(new Date(expiring.graph.order.expiresAt.getTime() + 1000));
        await runOnce(new Date(expiring.graph.order.expiresAt.getTime() + 2000));
        const closed = await sql<{ status: string }[]>`
          SELECT status FROM orders WHERE id = ${expiring.graph.order.id}
        `;
        expect(closed[0]?.status).toBe("closed");
        const restoredStock = await sql<{ stock: number }[]>`
          SELECT stock FROM variants WHERE id = ${largeVariant.id}
        `;
        expect(restoredStock[0]?.stock).toBe(3);
        expect(cancels.filter((id) => id === expiring.graph.payment.id)).toHaveLength(1);

        expect(await revokeGrant(sql, { grantId: buyerTokens.grantId, ownerId: buyerId })).toBe(
          true,
        );
        const reused = await refresh(started.origin, buyerTokens.refresh_token);
        expect(reused.error).toBe("invalid_grant");
        const otherRefresh = await refresh(started.origin, otherTokens.refresh_token);
        expect(otherRefresh.access_token).toEqual(expect.any(String));

        const page = renderToStaticMarkup(
          createElement(MerchantAuthorizeView, { notice: null, mustChangePassword: false }),
        );
        expect(page).toContain("请联系管理员开通");
        expect(page).not.toContain("注册");

        const captcha = fakeCaptcha(() => false);
        const sms = fakeSms();
        const blocked = await requestBuyerSms(
          {
            sql,
            clock: systemClock,
            captcha,
            sms,
            rateLimit: createMemoryRateLimit(smsRateLimitPolicies()),
          },
          { phone: "13900000009", captchaVerifyParam: "bad-captcha" },
        );
        expect(blocked).toMatchObject({ ok: false, error: "captcha_required" });
        expect(sms.sendCalls).toEqual([]);
      } finally {
        await started.close();
      }
    });
  });

  it("refuses foreign keys when an orphan row exists and does not delete it", async () => {
    const admin = postgres(databaseUrl, { max: 1 });
    const schema = `fk_${randomBytes(4).toString("hex")}`;
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.end({ timeout: 5 });
    const directory = path.join(process.cwd(), "src/db/migrations");
    const names = (await readdir(directory)).filter((name) => name !== "050_foreign_keys.sql");
    const temp = path.join(tmpdir(), schema);
    await mkdir(temp);
    try {
      for (const name of names) {
        await writeFile(path.join(temp, name), await readFile(path.join(directory, name)));
      }
      await runMigrations({ databaseUrl, directory: temp, searchPath: schema });
      const sql = postgres(databaseUrl, { max: 1 });
      await sql.unsafe(`SET search_path TO ${schema}`);
      await sql`
        INSERT INTO catalogs (id, merchant_id, name)
        VALUES ('cat_orphan', 'mch_missing', '孤立目录')
      `;
      const body = await readFile(path.join(directory, "050_foreign_keys.sql"), "utf8");
      await expect(sql.begin(async (tx) => tx.unsafe(body).simple())).rejects.toThrow(
        /orphan catalogs: cat_orphan/,
      );
      const remaining = await sql<
        { id: string }[]
      >`SELECT id FROM catalogs WHERE id = 'cat_orphan'`;
      expect(remaining).toHaveLength(1);
      await sql.end({ timeout: 5 });
    } finally {
      await rm(temp, { recursive: true, force: true });
      const cleanup = postgres(databaseUrl, { max: 1 });
      await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end({ timeout: 5 });
    }
  });
});

function routeFile(routePath: string): boolean {
  if (routePath === "/.well-known/oauth-protected-resource") {
    return true;
  }
  const parts = routePath
    .replace("/api/v1/", "")
    .split("/")
    .map((part) => (part.startsWith("{") ? `[${part.slice(1, -1)}]` : part));
  const file = path.join(process.cwd(), "src/app/api/v1", ...parts, "route.ts");
  return existsSync(file);
}

function fakePayment(cancels: string[]): PaymentPort {
  return {
    createPayment: (input) =>
      Promise.resolve({
        ok: true,
        action: `https://pay.example/${input.orderId}`,
        providerTradeNo: null,
      }),
    queryPayment: (input) =>
      Promise.resolve({ ok: true, status: "pending", providerTradeNo: input.providerTradeNo }),
    cancelPayment: (input) => {
      cancels.push(input.paymentId);
      return Promise.resolve({ ok: true });
    },
    verifyNotification: () =>
      Promise.resolve({
        ok: false,
        error: "invalid_signature",
        message: "验签失败。",
      }),
  };
}

function paidRuntime(runtime: CommerceRuntime): CommerceRuntime {
  return {
    ...runtime,
    payment: {
      ...runtime.payment,
      queryPayment: (input) =>
        Promise.resolve({
          ok: true,
          status: "paid",
          providerTradeNo: input.providerTradeNo ?? "trade_paid",
        }),
    },
  };
}

function commerceRuntimeFor(
  db: ReturnType<typeof drizzle>,
  sql: postgres.Sql,
  payment: PaymentPort,
): CommerceRuntime {
  return {
    repo: createDrizzleCommerceRepository(db),
    payment,
    clock: systemClock,
    ownedCatalogs: async (merchantId) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM catalogs WHERE merchant_id = ${merchantId} AND deleted_at IS NULL
      `;
      return rows.map((row) => row.id);
    },
  };
}

async function withAcceptance<T>(
  run: (input: { sql: postgres.Sql; db: ReturnType<typeof drizzle> }) => Promise<T>,
): Promise<T> {
  const admin = postgres(databaseUrl, { max: 1 });
  const schema = `acc_${randomBytes(4).toString("hex")}`;
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  await admin.end({ timeout: 5 });
  await runMigrations({ databaseUrl, searchPath: schema });
  const sql = postgres(databaseUrl, {
    max: 4,
    onnotice: () => undefined,
    connection: { search_path: schema },
  });
  const commerce = postgres(databaseUrl, {
    max: 4,
    onnotice: () => undefined,
    connection: { search_path: schema },
  });
  try {
    return await run({ sql, db: drizzle(commerce) });
  } finally {
    await sql.end({ timeout: 5 });
    await commerce.end({ timeout: 5 });
    const cleanup = postgres(databaseUrl, { max: 1 });
    await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanup.end({ timeout: 5 });
  }
}

async function issueTokens(
  started: Awaited<ReturnType<typeof startAuthorizationServer>>,
  sql: postgres.Sql,
  ownerId: string,
  ownerType: "merchant" | "buyer",
): Promise<{ access_token: string; refresh_token: string; grantId: string }> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const scope =
    ownerType === "merchant" ? "product:write product:read order:read" : "order:write order:read";
  const redirect = encodeURIComponent(agentRedirectUri);
  const auth = await fetch(
    `${started.origin}/oauth/auth?client_id=${agentClientId}&response_type=code&redirect_uri=${redirect}&scope=${encodeURIComponent(scope)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`,
    { redirect: "manual" },
  );
  const cookieHeader = auth.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
  const approved = await approveAgent({
    provider: started.provider,
    sql,
    cookieHeader,
    page: ownerType,
    ownerType,
    ownerId,
  });
  const resumed = await fetch(approved.returnTo, {
    redirect: "manual",
    headers: { cookie: cookieHeader },
  });
  const code = new URL(resumed.headers.get("location") ?? agentRedirectUri).searchParams.get(
    "code",
  );
  const tokenResponse = await fetch(`${started.origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: agentClientId,
      code: code ?? "",
      redirect_uri: agentRedirectUri,
      code_verifier: verifier,
    }),
  });
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { ...tokens, grantId: approved.grantId };
}

async function refresh(
  origin: string,
  refreshToken: string,
): Promise<{ refresh_token?: string; access_token?: string; error?: string }> {
  const response = await fetch(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: agentClientId,
      refresh_token: refreshToken,
    }),
  });
  return (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  };
}
