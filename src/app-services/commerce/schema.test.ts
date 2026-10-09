import { randomBytes } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { orders, payments } from "../../db/schema/commerce";
import { runMigrations } from "../../db/migrate";

describe("commerce schema", () => {
  it("keeps payment channel off the order header and unique client numbers inside a buyer", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
    }
    const columnNames = Object.values(getTableColumns(orders)).map((column) => column.name);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "buyer_id",
        "oauth_grant_id",
        "client_order_no",
        "currency",
        "amount",
        "status",
        "expires_at",
      ]),
    );
    for (const forbidden of [
      "provider",
      "channel",
      "payment_channel",
      "provider_trade_no",
      "deleted_at",
    ]) {
      expect(columnNames).not.toContain(forbidden);
    }
    const paymentColumns = Object.values(getTableColumns(payments)).map((column) => column.name);
    expect(paymentColumns).toContain("channel");
    expect(paymentColumns).not.toContain("payment_channel");

    const migration = await readFile(
      path.join(process.cwd(), "src/db/migrations/012_payment_channel.sql"),
      "utf8",
    );
    expect(migration).toContain("ADD COLUMN channel text NOT NULL DEFAULT 'desktop'");
    expect(migration).toContain("payments_channel_check");
    expect(migration).toContain("CHECK (channel IN ('desktop', 'mobile'))");
    expect(migration).not.toMatch(/ALTER TABLE orders/i);

    await withSchema(databaseUrl, async (sql) => {
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'orders'
      `;
      const names = columns.map((column) => column.column_name);
      expect(names).toContain("client_order_no");
      expect(names).not.toContain("provider");
      expect(names).not.toContain("channel");
      expect(names).not.toContain("payment_channel");
      expect(names).not.toContain("deleted_at");

      const foreignKeys = await sql<{ table_name: string; referenced: string }[]>`
        SELECT
          conrelid::regclass::text AS table_name,
          confrelid::regclass::text AS referenced
        FROM pg_constraint
        WHERE contype = 'f'
          AND connamespace = current_schema()::regnamespace
      `;
      expect(foreignKeys.length).toBeGreaterThan(0);
      const orderItemKeys = foreignKeys.filter((key) => key.table_name.endsWith("order_items"));
      expect(orderItemKeys.some((key) => key.referenced.endsWith("orders"))).toBe(true);
      expect(foreignKeys.some((key) => key.referenced.endsWith("buyers"))).toBe(true);

      await sql`
        INSERT INTO buyers (id, phone, password_hash)
        VALUES ('byr_1', '13900000001', 'hash'), ('byr_2', '13900000002', 'hash')
      `;
      await insertOrder(sql, "byr_1", "same-no");
      await expect(insertOrder(sql, "byr_1", "same-no")).rejects.toThrow();
      await insertOrder(sql, "byr_2", "same-no");

      await sql`
        INSERT INTO payments (
          id, order_id, provider, provider_trade_no, status, amount, currency, created_at, updated_at
        )
        SELECT 'pay_a', id, 'alipay', NULL, 'pending', amount, currency, created_at, updated_at
        FROM orders
        WHERE buyer_id = 'byr_1'
      `;
      await sql`
        INSERT INTO payments (
          id, order_id, provider, provider_trade_no, status, amount, currency, created_at, updated_at
        )
        SELECT 'pay_b', id, 'alipay', NULL, 'pending', amount, currency, created_at, updated_at
        FROM orders
        WHERE buyer_id = 'byr_2'
      `;
      const storedChannels = await sql<{ id: string; channel: string }[]>`
        SELECT id, channel FROM payments ORDER BY id
      `;
      expect(storedChannels).toEqual([
        { id: "pay_a", channel: "desktop" },
        { id: "pay_b", channel: "desktop" },
      ]);
      await expect(
        sql`UPDATE payments SET channel = 'tablet' WHERE id = 'pay_a'`,
      ).rejects.toThrow();
      await sql`UPDATE payments SET channel = 'mobile' WHERE id = 'pay_a'`;

      await expect(sql`
        UPDATE payments SET provider_trade_no = 'trade_same'
      `).rejects.toThrow();
    });
  });

  it("backfills payments created before the channel column as desktop", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
    }
    const staging = await mkdtemp(path.join(tmpdir(), "merclink-pay-channel-"));
    const schema = `cm_${randomBytes(4).toString("hex")}`;
    const admin = postgres(databaseUrl, { max: 1 });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.end({ timeout: 5 });
    try {
      await copyFile(
        path.join(process.cwd(), "src/db/migrations/010_schema.sql"),
        path.join(staging, "010_schema.sql"),
      );
      await copyFile(
        path.join(process.cwd(), "src/db/migrations/011_merchant_profiles.sql"),
        path.join(staging, "011_merchant_profiles.sql"),
      );
      await runMigrations({ databaseUrl, directory: staging, searchPath: schema });
      const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
      try {
        await sql`SET search_path TO ${sql(schema)}`;
        const before = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'payments'
        `;
        expect(before.map((column) => column.column_name)).not.toContain("channel");
        await sql`
          INSERT INTO buyers (id, phone, password_hash)
          VALUES ('byr_old', '13900000009', 'hash')
        `;
        await insertOrder(sql, "byr_old", "before-channel");
        await sql`
          INSERT INTO payments (
            id, order_id, provider, provider_trade_no, status, amount, currency, created_at, updated_at
          )
          SELECT 'pay_old', id, 'alipay', NULL, 'pending', amount, currency, created_at, updated_at
          FROM orders
          WHERE buyer_id = 'byr_old'
        `;
        await copyFile(
          path.join(process.cwd(), "src/db/migrations/012_payment_channel.sql"),
          path.join(staging, "012_payment_channel.sql"),
        );
        await runMigrations({ databaseUrl, directory: staging, searchPath: schema });
        const rows = await sql<
          { channel: string }[]
        >`SELECT channel FROM payments WHERE id = 'pay_old'`;
        expect(rows).toEqual([{ channel: "desktop" }]);
        const orderColumns = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'orders'
            AND column_name IN ('channel', 'payment_channel')
        `;
        expect(orderColumns).toEqual([]);
        await expect(
          sql`UPDATE payments SET channel = 'app' WHERE id = 'pay_old'`,
        ).rejects.toThrow();
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      const cleanup = postgres(databaseUrl, { max: 1 });
      await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end({ timeout: 5 });
      await rm(staging, { recursive: true, force: true });
    }
  });
});

describe("easypay finite stock migration", () => {
  it("adds nullable payment columns and one receipt per payment without changing provider", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
    }
    await withSchema(databaseUrl, async (sql) => {
      const columns = await sql<{ column_name: string; is_nullable: string }[]>`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'payments'
          AND column_name IN ('action_url', 'client_address', 'stock_release_at', 'provider')
      `;
      expect(columns).toEqual(
        expect.arrayContaining([
          { column_name: "action_url", is_nullable: "YES" },
          { column_name: "client_address", is_nullable: "YES" },
          { column_name: "stock_release_at", is_nullable: "YES" },
          { column_name: "provider", is_nullable: "NO" },
        ]),
      );
      await sql`
        INSERT INTO buyers (id, phone, password_hash)
        VALUES ('byr_easy', '13900000018', 'hash')
      `;
      await insertOrder(sql, "byr_easy", "keep-alipay");
      await sql`
        INSERT INTO payments (
          id, order_id, provider, provider_trade_no, status, amount, currency, created_at, updated_at
        )
        SELECT 'pay_easy', id, 'alipay', NULL, 'pending', amount, currency, created_at, updated_at
        FROM orders
        WHERE buyer_id = 'byr_easy'
      `;
      const stored = await sql<
        {
          provider: string;
          action_url: string | null;
          client_address: string | null;
          stock_release_at: Date | null;
        }[]
      >`
        SELECT provider, action_url, client_address, stock_release_at
        FROM payments
        WHERE id = 'pay_easy'
      `;
      expect(stored).toEqual([
        {
          provider: "alipay",
          action_url: null,
          client_address: null,
          stock_release_at: null,
        },
      ]);
      await sql`
        INSERT INTO unapplied_receipts (
          id, payment_id, provider_trade_no, amount, status, created_at, updated_at
        ) VALUES (
          'rcp_1', 'pay_easy', 'trade_1', 100, 'open', now(), now()
        )
      `;
      await expect(sql`
        INSERT INTO unapplied_receipts (
          id, payment_id, provider_trade_no, amount, status, created_at, updated_at
        ) VALUES (
          'rcp_2', 'pay_easy', 'trade_1', 100, 'open', now(), now()
        )
      `).rejects.toThrow();
    });
  });
});

async function insertOrder(
  sql: postgres.Sql,
  buyerId: string,
  clientOrderNo: string,
): Promise<void> {
  const id = `ord_${buyerId}_${clientOrderNo}`;
  await sql`
    INSERT INTO orders (
      id, buyer_id, oauth_grant_id, client_order_no, currency, amount, status,
      created_at, updated_at, expires_at
    ) VALUES (
      ${id},
      ${buyerId},
      'grn_1',
      ${clientOrderNo},
      'CNY',
      100,
      'pending',
      now(),
      now(),
      now() + interval '30 minutes'
    )
  `;
}

async function withSchema(
  databaseUrl: string,
  run: (sql: postgres.Sql) => Promise<void>,
): Promise<void> {
  const schema = `cm_${randomBytes(4).toString("hex")}`;
  const admin = postgres(databaseUrl, { max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  await admin.end({ timeout: 5 });
  try {
    await runMigrations({
      databaseUrl,
      directory: path.join(process.cwd(), "src/db/migrations"),
      searchPath: schema,
    });
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    try {
      await sql`SET search_path TO ${sql(schema)}`;
      await run(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    const cleanup = postgres(databaseUrl, { max: 1 });
    await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanup.end({ timeout: 5 });
  }
}
