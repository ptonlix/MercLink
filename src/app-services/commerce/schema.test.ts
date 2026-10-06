import { randomBytes } from "node:crypto";
import path from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { orders } from "../../db/schema/commerce";
import { runMigrations } from "../../db/migrate";

describe("commerce schema", () => {
  it("keeps payment channel off the order header and unique client numbers inside a buyer", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required. Start compose.yaml and export DATABASE_URL.");
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
      await expect(sql`
        UPDATE payments SET provider_trade_no = 'trade_same'
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
