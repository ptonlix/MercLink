import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "../db/client";
import { runMigrations } from "../db/migrate";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl === undefined || configuredDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required. Start compose.yaml and export DATABASE_URL.");
}
const databaseUrl: string = configuredDatabaseUrl;

const ledger = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

describe("migrations", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("applies 010 before 020 and does not repeat completed files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "merclink-migrations-"));
    await writeFile(
      path.join(directory, "010_platform.sql"),
      `${ledger}
CREATE TABLE exec_log (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO exec_log (name) VALUES ('010_platform.sql');
`,
    );
    await writeFile(
      path.join(directory, "020_identity.sql"),
      "INSERT INTO exec_log (name) VALUES ('020_identity.sql');\n",
    );

    try {
      await withSchema(async (schema) => {
        const first = await runMigrations({ databaseUrl, directory, searchPath: schema });
        const second = await runMigrations({ databaseUrl, directory, searchPath: schema });
        const sql = postgres(databaseUrl, { max: 1 });
        try {
          await sql`SET search_path TO ${sql(schema)}`;
          const executed = await sql<{ name: string }[]>`
            SELECT name FROM exec_log ORDER BY id
          `;
          const recorded = await sql<{ filename: string }[]>`
            SELECT filename FROM schema_migrations ORDER BY filename
          `;
          expect(first).toEqual(["010_platform.sql", "020_identity.sql"]);
          expect(second).toEqual([]);
          expect(executed.map((row) => row.name)).toEqual(["010_platform.sql", "020_identity.sql"]);
          expect(recorded.map((row) => row.filename)).toEqual([
            "010_platform.sql",
            "020_identity.sql",
          ]);
        } finally {
          await sql.end({ timeout: 5 });
        }
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("applies the real platform ledger once", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/db/migrations/010_platform.sql"),
      "utf8",
    );
    expect(source).toContain("schema_migrations");
    expect(source).not.toMatch(/CREATE TABLE(?! IF NOT EXISTS schema_migrations)/i);

    await withSchema(async (schema) => {
      const directory = path.join(process.cwd(), "src/db/migrations");
      const first = await runMigrations({ databaseUrl, directory, searchPath: schema });
      const second = await runMigrations({ databaseUrl, directory, searchPath: schema });
      const sql = postgres(databaseUrl, { max: 1 });
      try {
        await sql`SET search_path TO ${sql(schema)}`;
        const rows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
        const expected = (await readdir(directory))
          .filter((name) => name.endsWith(".sql"))
          .sort((left, right) => left.localeCompare(right, "en"));
        expect(first).toEqual(expected);
        expect(second).toEqual([]);
        expect(rows.map((row) => row.filename).sort()).toEqual(expected);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it("aborts when a migration fails and leaves it unrecorded", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "merclink-migrations-"));
    await writeFile(path.join(directory, "010_platform.sql"), ledger);
    await writeFile(
      path.join(directory, "020_identity.sql"),
      "SELECT * FROM migration_should_fail;\n",
    );
    try {
      await withSchema(async (schema) => {
        await expect(
          runMigrations({ databaseUrl, directory, searchPath: schema }),
        ).rejects.toThrow();
        const sql = postgres(databaseUrl, { max: 1 });
        try {
          await sql`SET search_path TO ${sql(schema)}`;
          const rows = await sql<{ filename: string }[]>`
            SELECT filename FROM schema_migrations ORDER BY filename
          `;
          expect(rows.map((row) => row.filename)).toEqual(["010_platform.sql"]);
        } finally {
          await sql.end({ timeout: 5 });
        }
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("opens a database client against the compose database", async () => {
    const handle = getDatabase(databaseUrl);
    const rows = await handle.sql<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });
});

async function withSchema(run: (schema: string) => Promise<void>): Promise<void> {
  const schema = `pf_${randomBytes(4).toString("hex")}`;
  const sql = postgres(databaseUrl, { max: 1 });
  await sql.unsafe(`CREATE SCHEMA ${schema}`);
  try {
    await run(schema);
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.end({ timeout: 5 });
  }
}
