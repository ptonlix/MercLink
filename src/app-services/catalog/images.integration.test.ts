import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { POST as uploadRoute } from "../../app/api/v1/catalogs/[id]/images/route";
import { PATCH as patchProductRoute } from "../../app/api/v1/catalogs/[id]/products/[product_id]/route";
import { PATCH as patchVariantRoute } from "../../app/api/v1/catalogs/[id]/variants/[variant_id]/route";
import { GET as mediaRoute } from "../../app/media/[id]/route";
import { runMigrations } from "../../db/migrate";
import { buyerActor, merchantActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { createClockRateLimit } from "../../adapters/redis/clock-rate-limit";
import { systemClock, type Clock } from "../../ports/clock";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";
import { imageUploadLimit, imageUploadWindowMs, maxImageBytes } from "../../domain/catalog/images";
import { createCatalog } from "./catalogs";
import { bindCatalogSql } from "./http";
import { createProduct } from "./products";
import { bindMediaRuntime, resetMediaRuntime } from "./media-runtime";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl === undefined || configuredDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required. Start compose.yaml and export DATABASE_URL.");
}
const databaseUrl: string = configuredDatabaseUrl;
const origin = "https://merclink.example";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

describe("product images", () => {
  afterAll(() => {
    resetAuthenticator();
    resetMediaRuntime();
    bindCatalogSql(undefined);
  });

  it("migrates product_images with a catalog foreign key and no deleted_at", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/db/migrations/010_schema.sql"),
      "utf8",
    );
    const images = source.slice(source.indexOf("CREATE TABLE product_images"), source.indexOf("CREATE TABLE product_images") + 700);
    expect(images).toContain("REFERENCES catalogs (id)");
    expect(images.split(";")[0]).not.toContain("deleted_at");
    expect(images.split(";")[0]).not.toMatch(/references\s+merchants/i);
    await withImageDb(async (sql, schema) => {
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'product_images'
      `;
      expect(columns.map((column) => column.column_name)).not.toContain("deleted_at");
      const foreignKeys = await sql<{ definition: string }[]>`
        SELECT pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND rel.relname = 'product_images'
          AND con.contype = 'f'
      `;
      expect(foreignKeys.map((row) => row.definition).join(" ")).toContain(
        "REFERENCES catalogs(id)",
      );
      const again = await runMigrations({
        databaseUrl,
        searchPath: schema,
      });
      expect(again).toEqual([]);
    });
  });

  it("uploads for the owning merchant and rejects buyers and other catalogs", async () => {
    await withImageDb(async (sql) => {
      const storage = memoryStorage();
      const limiter = countingLimit(createClockRateLimit({ now: () => new Date(1_000) }));
      bind(sql, storage.port, limiter.port);
      const catalog = await mustCatalog(sql, "mch_a");
      asMerchant("mch_a");

      const created = await uploadRoute(
        uploadRequest(catalog.id, png, "secret-name.png", "image/svg+xml"),
        {
          params: Promise.resolve({ id: catalog.id }),
        },
      );
      expect(created.status).toBe(201);
      const body = (await created.json()) as {
        id: string;
        url: string;
        content_type: string;
        byte_size: number;
      };
      expect(body.id.startsWith("img_")).toBe(true);
      expect(body.id).not.toContain("secret-name");
      expect(body.url).toBe(`${origin}/media/${body.id}`);
      expect(body.content_type).toBe("image/png");
      expect(body.byte_size).toBe(png.byteLength);
      expect(storage.puts).toEqual([body.id]);

      asBuyer();
      const forbidden = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      expect(forbidden.status).toBe(403);
      await expect(forbidden.json()).resolves.toMatchObject({ error: "forbidden" });
      expect(storage.puts).toEqual([body.id]);
      expect(limiter.consumes).toBe(1);

      asMerchant("mch_b");
      const other = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      expect(other.status).toBe(404);
      await expect(other.json()).resolves.toMatchObject({ error: "not_found" });
      expect(storage.puts).toEqual([body.id]);
    });
  });

  it("does not write objects when limited or when the limiter is down", async () => {
    await withImageDb(async (sql) => {
      const storage = memoryStorage();
      let now = 10_000;
      const clock: Clock = { now: () => new Date(now) };
      bind(sql, storage.port, createClockRateLimit(clock), clock);
      const catalog = await mustCatalog(sql, "mch_a");
      asMerchant("mch_a");

      for (let attempt = 0; attempt < imageUploadLimit; attempt += 1) {
        const rejected = await uploadRoute(uploadRequest(catalog.id, svg), {
          params: Promise.resolve({ id: catalog.id }),
        });
        expect(rejected.status).toBe(400);
        await expect(rejected.json()).resolves.toMatchObject({ error: "validation_error" });
      }
      const limited = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      expect(limited.status).toBe(429);
      await expect(limited.json()).resolves.toMatchObject({ error: "rate_limited" });
      expect(storage.puts).toEqual([]);

      now += imageUploadWindowMs + 1;
      const allowed = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      expect(allowed.status).toBe(201);
      expect(storage.puts).toHaveLength(1);

      const down = memoryStorage();
      bind(sql, down.port, {
        reserve: () => Promise.resolve({ ok: false, error: "unavailable" }),
        release: () => Promise.resolve({ ok: true }),
      });
      const unavailable = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      expect(unavailable.status).toBe(503);
      await expect(unavailable.json()).resolves.toMatchObject({ error: "dependency_unavailable" });
      expect(down.puts).toEqual([]);
    });
  });

  it("serves anonymous media bytes without Redis and keeps unknown ids private", async () => {
    await withImageDb(async (sql) => {
      const storage = memoryStorage();
      const limiter = countingLimit(createClockRateLimit({ now: () => new Date(1_000) }));
      bind(sql, storage.port, limiter.port);
      const catalog = await mustCatalog(sql, "mch_a");
      asMerchant("mch_a");
      const created = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      const body = (await created.json()) as { id: string };
      const consumesBeforeRead = limiter.consumes;

      resetAuthenticator();
      const response = await mediaRoute(new Request(`${origin}/media/${body.id}`), {
        params: Promise.resolve({ id: body.id }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
      expect(limiter.consumes).toBe(consumesBeforeRead);

      const missing = await mediaRoute(new Request(`${origin}/media/img_missing`), {
        params: Promise.resolve({ id: "img_missing" }),
      });
      expect(missing.status).toBe(404);
      const missingBody = await missing.text();
      expect(missingBody).not.toContain(body.id);
      expect(limiter.consumes).toBe(consumesBeforeRead);
    });
  });

  it("accepts owned media and external covers, and keeps old non-url values readable", async () => {
    await withImageDb(async (sql) => {
      const storage = memoryStorage();
      bind(sql, storage.port, createClockRateLimit({ now: () => new Date(1_000) }));
      const catalog = await mustCatalog(sql, "mch_a");
      const other = await mustCatalog(sql, "mch_b", "另一目录");
      asMerchant("mch_a");
      const uploaded = await uploadRoute(uploadRequest(catalog.id, png), {
        params: Promise.resolve({ id: catalog.id }),
      });
      const image = (await uploaded.json()) as { id: string; url: string };
      const product = await createProduct(sql, "mch_a", catalog.id, {
        title: "短靴",
        price: 100,
        stock: 1,
      });
      expect(product.ok).toBe(true);
      if (!product.ok) {
        return;
      }
      const variantId = product.value.variants[0]?.id;
      expect(variantId).toBeTypeOf("string");

      const attached = await patchProductRoute(
        jsonRequest(catalog.id, product.value.id, { cover: image.url }),
        { params: Promise.resolve({ id: catalog.id, product_id: product.value.id }) },
      );
      expect(attached.status).toBe(200);
      await expect(attached.json()).resolves.toMatchObject({ cover: image.url });

      const external = await patchProductRoute(
        jsonRequest(catalog.id, product.value.id, { cover: "https://img.example/a.png" }),
        { params: Promise.resolve({ id: catalog.id, product_id: product.value.id }) },
      );
      expect(external.status).toBe(200);
      await expect(external.json()).resolves.toMatchObject({ cover: "https://img.example/a.png" });
      expect(storage.deletes).toEqual([]);
      expect(storage.objects.has(image.id)).toBe(true);

      await sql`UPDATE products SET cover = ${"not a url"} WHERE id = ${product.value.id}`;
      const invalid = await patchProductRoute(
        jsonRequest(catalog.id, product.value.id, { cover: "not a url" }),
        { params: Promise.resolve({ id: catalog.id, product_id: product.value.id }) },
      );
      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toMatchObject({ error: "validation_error" });
      const stored = await sql<{ cover: string }[]>`
        SELECT cover FROM products WHERE id = ${product.value.id}
      `;
      expect(stored[0]?.cover).toBe("not a url");

      asMerchant("mch_b");
      const otherUpload = await uploadRoute(uploadRequest(other.id, png), {
        params: Promise.resolve({ id: other.id }),
      });
      const otherImage = (await otherUpload.json()) as { url: string };
      asMerchant("mch_a");
      const foreign = await patchProductRoute(
        jsonRequest(catalog.id, product.value.id, { cover: otherImage.url }),
        { params: Promise.resolve({ id: catalog.id, product_id: product.value.id }) },
      );
      expect(foreign.status).toBe(404);
      await expect(foreign.json()).resolves.toMatchObject({ error: "not_found" });
      const unchanged = await sql<{ cover: string }[]>`
        SELECT cover FROM products WHERE id = ${product.value.id}
      `;
      expect(unchanged[0]?.cover).toBe("not a url");

      const variant = await patchVariantRoute(
        jsonRequest(catalog.id, variantId ?? "", { cover: image.url }),
        { params: Promise.resolve({ id: catalog.id, variant_id: variantId ?? "" }) },
      );
      expect(variant.status).toBe(200);
      const variantBody = (await variant.json()) as { variants: { cover: string | null }[] };
      expect(variantBody.variants[0]?.cover).toBe(image.url);
    });
  });
});

function asMerchant(merchantId: string): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: merchantActor({
      merchantId,
      grantId: "grn_1",
      scopes: ["product:write", "product:read"],
    }),
  }));
}

function asBuyer(): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: buyerActor({
      buyerId: "byr_1",
      grantId: "grn_buyer",
      scopes: ["order:write", "order:read"],
    }),
  }));
}

function bind(
  sql: postgres.Sql,
  storage: ObjectStoragePort,
  rateLimit: RateLimitPort,
  clock: Clock = systemClock,
): void {
  bindCatalogSql(sql);
  bindMediaRuntime({ rateLimit, objectStorage: storage, mediaBaseUrl: origin, clock });
}

function uploadRequest(
  catalogId: string,
  bytes: Uint8Array,
  name = "photo.png",
  type = "image/png",
) {
  const form = new FormData();
  form.set("file", new File([binaryBody(bytes)], name, { type }));
  return new Request(`${origin}/api/v1/catalogs/${catalogId}/images`, {
    method: "POST",
    headers: { authorization: "Bearer merchant-token" },
    body: form,
  });
}

function jsonRequest(catalogId: string, id: string, body: unknown): Request {
  return new Request(`${origin}/api/v1/catalogs/${catalogId}/products/${id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer merchant-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function binaryBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function memoryStorage(): {
  port: ObjectStoragePort;
  puts: string[];
  deletes: string[];
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>();
  const puts: string[] = [];
  const deletes: string[] = [];
  return {
    puts,
    deletes,
    objects,
    port: {
      put: (input) => {
        puts.push(input.key);
        objects.set(input.key, input.bytes);
        return Promise.resolve();
      },
      open: (key) => {
        const bytes = objects.get(key);
        return Promise.resolve(bytes === undefined ? null : { bytes, contentType: "image/png" });
      },
      delete: (key) => {
        deletes.push(key);
        objects.delete(key);
        return Promise.resolve();
      },
      headBucket: () => Promise.resolve(),
    },
  };
}

function countingLimit(inner: RateLimitPort): { port: RateLimitPort; consumes: number } {
  const state = { consumes: 0 };
  return {
    get consumes() {
      return state.consumes;
    },
    port: {
      reserve: (input) => {
        state.consumes += 1;
        return inner.reserve(input);
      },
      release: (reservation) => inner.release(reservation),
    },
  };
}

async function mustCatalog(sql: postgres.Sql, merchantId: string, name = "跑鞋") {
  const created = await createCatalog(sql, merchantId, { name });
  if (!created.ok) {
    throw new Error(created.message);
  }
  return created.value;
}

async function withImageDb(
  run: (sql: postgres.Sql, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `img_${randomBytes(4).toString("hex")}`;
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
        ('mch_b', '乙商家', '13800000002', 'hash', 'active', 'adm_test')
    `;
    await run(sql, schema);
  } finally {
    resetAuthenticator();
    resetMediaRuntime();
    bindCatalogSql(undefined);
    await sql.end({ timeout: 5 });
    const drop = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await drop.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await drop.end({ timeout: 5 });
  }
}
