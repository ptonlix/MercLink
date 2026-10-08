import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;
export type Database = PostgresJsDatabase;

export type DatabaseHandle = {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
};

export function createDatabase(databaseUrl: string): DatabaseHandle {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql);
  // Drizzle replaces jsonb and timestamp serializers with an identity function
  // so its already-stringified parameters are not encoded twice. Tagged queries
  // still pass objects and Date values, which postgres.js must stringify.
  preserveDriverParameters(sql);
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

const dateParameterOids = [1082, 1083, 1114, 1184];

function preserveDriverParameters(sql: Sql): void {
  const serializers = sql.options.serializers;
  serializers[114] = jsonbParameter;
  serializers[3802] = jsonbParameter;
  for (const oid of dateParameterOids) {
    serializers[oid] = dateParameter;
  }
}

function jsonbParameter(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function dateParameter(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

const pools = new Map<string, DatabaseHandle>();

export function getDatabase(databaseUrl = process.env.DATABASE_URL): DatabaseHandle {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is not set");
  }
  const existing = pools.get(databaseUrl);
  if (existing !== undefined) {
    return existing;
  }
  const created = createDatabase(databaseUrl);
  pools.set(databaseUrl, created);
  return created;
}

export async function closeDatabase(databaseUrl?: string): Promise<void> {
  if (databaseUrl !== undefined) {
    const current = pools.get(databaseUrl);
    pools.delete(databaseUrl);
    await current?.close();
    return;
  }
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((handle) => handle.close()));
}
