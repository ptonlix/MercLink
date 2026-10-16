import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl === undefined || configuredDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
}
const databaseUrl: string = configuredDatabaseUrl;
const migrationsDirectory = path.join(process.cwd(), "src/db/migrations");

describe("product description migration", () => {
  it("adds nullable columns on an empty database and does not backfill", async () => {
    const source = await readFile(
      path.join(migrationsDirectory, "017_product_description.sql"),
      "utf8",
    );
    expect(source).toContain("FROM product_fields WHERE key = 'description'");
    expect(source).toContain("RAISE EXCEPTION");
    expect(source).toContain("ADD COLUMN description text");
    expect(source).toContain("ADD COLUMN description_snapshot text");
    expect(source).not.toMatch(/UPDATE\s+products/i);
    expect(source).not.toMatch(/UPDATE\s+order_items/i);
    expect(source).not.toMatch(/INSERT\s+INTO\s+products/i);
    expect(source).not.toMatch(/INSERT\s+INTO\s+order_items/i);

    await withSchema(async (sql) => {
      const schema = await currentSchema(sql);
      const before = await mkdtemp(path.join(tmpdir(), "merclink-description-before-"));
      try {
        await copyMigrationsBefore(before, "017_product_description.sql");
        await runMigrations({ databaseUrl, directory: before, searchPath: schema });
        await seedProductAndOrder(sql);
      } finally {
        await rm(before, { recursive: true, force: true });
      }
      await runMigrations({ databaseUrl, searchPath: schema });
      const columns = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'products' AND column_name = 'description')
            OR (table_name = 'order_items' AND column_name = 'description_snapshot')
          )
        ORDER BY table_name, column_name
      `;
      expect(columns).toEqual([
        { table_name: "order_items", column_name: "description_snapshot", is_nullable: "YES" },
        { table_name: "products", column_name: "description", is_nullable: "YES" },
      ]);
      const product = await sql<{ description: string | null }[]>`
        SELECT description FROM products WHERE id = 'prd_old'
      `;
      const line = await sql<{ description_snapshot: string | null }[]>`
        SELECT description_snapshot FROM order_items WHERE id = 'itm_old'
      `;
      expect(product[0]?.description).toBeNull();
      expect(line[0]?.description_snapshot).toBeNull();
    });
  });

  it("fails when a catalog field already uses the description key", async () => {
    await withSchema(async (sql) => {
      const schema = await currentSchema(sql);
      const staging = await mkdtemp(path.join(tmpdir(), "merclink-description-conflict-"));
      try {
        await copyMigrationsBefore(staging, "017_product_description.sql");
        await runMigrations({ databaseUrl, directory: staging, searchPath: schema });
        await seedCatalog(sql);
        await sql`
          INSERT INTO product_fields (id, catalog_id, key, label, type, required, status)
          VALUES ('fld_desc', 'cat_desc', 'description', '描述', 'text', false, 'active')
        `;
        await copyFile(
          path.join(migrationsDirectory, "017_product_description.sql"),
          path.join(staging, "017_product_description.sql"),
        );
        await expect(
          runMigrations({ databaseUrl, directory: staging, searchPath: schema }),
        ).rejects.toThrow(/description/);
        const columns = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND (
              (table_name = 'products' AND column_name = 'description')
              OR (table_name = 'order_items' AND column_name = 'description_snapshot')
            )
        `;
        expect(columns).toEqual([]);
        const field = await sql<{ key: string; status: string }[]>`
          SELECT key, status FROM product_fields WHERE id = 'fld_desc'
        `;
        expect(field).toEqual([{ key: "description", status: "active" }]);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    });
  });
});

async function copyMigrationsBefore(directory: string, untilExclusive: string): Promise<void> {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql") && name < untilExclusive)
    .sort((left, right) => left.localeCompare(right, "en"));
  for (const name of names) {
    await copyFile(path.join(migrationsDirectory, name), path.join(directory, name));
  }
}

async function currentSchema(sql: postgres.Sql): Promise<string> {
  const rows = await sql<{ schema: string }[]>`SELECT current_schema() AS schema`;
  const schema = rows[0]?.schema;
  if (schema === undefined) {
    throw new Error("missing schema");
  }
  return schema;
}

async function seedCatalog(sql: postgres.Sql): Promise<void> {
  await sql`
    INSERT INTO admins (id, phone, password_hash)
    VALUES ('adm_desc', '13800000099', 'hash')
  `;
  await sql`
    INSERT INTO merchants (id, name, phone, password_hash, status, created_by)
    VALUES ('mch_desc', '描述商家', '13800000098', 'hash', 'active', 'adm_desc')
  `;
  await sql`
    INSERT INTO catalogs (id, merchant_id, name)
    VALUES ('cat_desc', 'mch_desc', '目录')
  `;
}

async function seedProductAndOrder(sql: postgres.Sql): Promise<void> {
  await seedCatalog(sql);
  await sql`
    INSERT INTO products (id, catalog_id, title, status, fields, schema_revision)
    VALUES ('prd_old', 'cat_desc', '旧商品', 'on', '{}'::jsonb, 0)
  `;
  await sql`
    INSERT INTO variants (id, catalog_id, product_id, option_values, price, status)
    VALUES ('var_old', 'cat_desc', 'prd_old', '{}'::jsonb, 100, 'on')
  `;
  await sql`
    INSERT INTO buyers (id, phone, password_hash)
    VALUES ('byr_old', '13900000099', 'hash')
  `;
  await sql`
    INSERT INTO orders (
      id, buyer_id, oauth_grant_id, client_order_no, currency, amount, status,
      created_at, updated_at, expires_at
    )
    VALUES (
      'ord_old', 'byr_old', 'grn_old', 'old-1', 'CNY', 100, 'pending',
      now(), now(), now()
    )
  `;
  await sql`
    INSERT INTO order_items (
      id, order_id, catalog_id, product_id, variant_id, title_snapshot, variant_snapshot,
      price_snapshot, fields_snapshot, schema_revision, qty, amount, created_at
    )
    VALUES (
      'itm_old', 'ord_old', 'cat_desc', 'prd_old', 'var_old', '旧商品', '{}'::jsonb,
      100, '{}'::jsonb, 0, 1, 100, now()
    )
  `;
}

async function withSchema(run: (sql: postgres.Sql) => Promise<void>): Promise<void> {
  const schema = `dsc_${randomBytes(4).toString("hex")}`;
  const admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  await admin.end({ timeout: 5 });
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => undefined,
    connection: { search_path: schema },
  });
  try {
    await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
    const cleanup = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanup.end({ timeout: 5 });
  }
}
