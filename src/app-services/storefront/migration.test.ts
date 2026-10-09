import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl === undefined || configuredDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required. Start compose.dev.yaml and export DATABASE_URL.");
}
const databaseUrl: string = configuredDatabaseUrl;

describe("storefront migration", () => {
  it("adds the release record and a null pointer", async () => {
    const source = await readFile("src/db/migrations/014_storefront_releases.sql", "utf8");
    expect(source).toContain("CREATE TABLE storefront_releases");
    expect(source).toContain("CREATE TABLE storefront_pointer");
    expect(source).not.toContain("process.exit");
    const schema = `sf_${randomBytes(4).toString("hex")}`;
    const admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.end({ timeout: 5 });
    try {
      await runMigrations({ databaseUrl, searchPath: schema });
      const sql = postgres(databaseUrl, {
        max: 1,
        onnotice: () => undefined,
        connection: { search_path: schema },
      });
      try {
        const rows = await sql<{ active_release_id: string | null }[]>`
          SELECT active_release_id FROM storefront_pointer WHERE id = 'current'
        `;
        expect(rows[0]?.active_release_id ?? null).toBeNull();
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      const cleanup = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
      await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end({ timeout: 5 });
    }
  });
});
