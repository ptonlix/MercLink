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
  return {
    db: drizzle(sql),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

let singleton: DatabaseHandle | undefined;

export function getDatabase(databaseUrl = process.env.DATABASE_URL): DatabaseHandle {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is not set");
  }
  singleton ??= createDatabase(databaseUrl);
  return singleton;
}

export async function closeDatabase(): Promise<void> {
  if (singleton === undefined) {
    return;
  }
  const current = singleton;
  singleton = undefined;
  await current.close();
}
