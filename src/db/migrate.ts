import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const sqlFilename = /^[0-9A-Za-z._-]+\.sql$/;

export type RunMigrationsOptions = {
  databaseUrl: string;
  directory?: string;
  searchPath?: string;
};

function defaultDirectory(): string {
  return path.join(process.cwd(), "src/db/migrations");
}

function assertIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("Invalid SQL identifier");
  }
  return value;
}

async function appliedFilenames(sql: postgres.Sql): Promise<Set<string>> {
  const found = await sql<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'schema_migrations'
    ) AS present
  `;
  const row = found[0];
  if (row?.present !== true) {
    return new Set();
  }
  const rows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
  return new Set(rows.map((item) => item.filename));
}

export async function runMigrations(options: RunMigrationsOptions): Promise<readonly string[]> {
  const directory = options.directory ?? defaultDirectory();
  const names = (await readdir(directory))
    .filter((name) => sqlFilename.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));
  const sql = postgres(options.databaseUrl, {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    if (options.searchPath !== undefined) {
      const schema = assertIdentifier(options.searchPath);
      await sql`SET search_path TO ${sql(schema)}`;
    }
    await sql`SELECT pg_advisory_lock(2142010010)`;
    try {
      const applied = await appliedFilenames(sql);
      const executed: string[] = [];
      for (const filename of names) {
        if (applied.has(filename)) {
          continue;
        }
        const body = await readFile(path.join(directory, filename), "utf8");
        await sql.begin(async (tx) => {
          await tx.unsafe(body).simple();
          await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
        });
        executed.push(filename);
      }
      return executed;
    } finally {
      await sql`SELECT pg_advisory_unlock(2142010010)`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
