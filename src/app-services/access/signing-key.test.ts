import { describe, expect, it } from "vitest";
import { withIdentityDatabase } from "../identity/database";
import { loadSigningJwk } from "./provider";

describe("oauth signing key", () => {
  it("returns the stored key and does not insert another when one exists", async () => {
    await withIdentityDatabase(async (sql) => {
      const stored = {
        kty: "RSA",
        kid: "stored-kid",
        n: "stored-modulus",
        alg: "RS256",
        use: "sig",
      };
      await sql`
        INSERT INTO oauth_signing_keys (kid, jwk)
        VALUES ('stored-kid', ${sql.json(stored)})
      `;
      const loaded = await loadSigningJwk(sql);
      expect(loaded).toEqual(stored);
      const rows = await sql<{ count: string }[]>`SELECT count(*) FROM oauth_signing_keys`;
      expect(rows[0]?.count).toBe("1");
    });
  });

  it("returns the same stored key when two workers insert together", async () => {
    await withIdentityDatabase(async (sql) => {
      const [first, second] = await Promise.all([loadSigningJwk(sql), loadSigningJwk(sql)]);
      const rows = await sql<{ jwk: Record<string, unknown> }[]>`
        SELECT jwk FROM oauth_signing_keys ORDER BY created_at, kid
      `;
      expect(rows[0]?.jwk).toEqual(first);
      expect(second).toEqual(first);
      expect(rows).toHaveLength(1);
    });
  });
});
