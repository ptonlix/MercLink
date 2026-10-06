import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { runMigrations } from "../../db/migrate";
import type { Sql } from "../../db/client";

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_URL is required. Start compose.yaml and export DATABASE_URL.");
  }
  return value;
}

export async function withIdentityDatabase<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  const databaseUrl = requireDatabaseUrl();
  const schema = `id_${randomBytes(4).toString("hex")}`;
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
    await sql.unsafe(`SET search_path TO ${schema}`);
    return await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
    const cleanup = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanup.end({ timeout: 5 });
  }
}
