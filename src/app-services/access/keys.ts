import { randomBytes } from "node:crypto";
import type { Sql } from "../../db/client";
import { apiKeyAllowed, apiKeyPrefix } from "../../domain/access/api-key";
import { fixedApprovalScopes, type AuthorizationPage } from "../../domain/access/scopes";
import { tokenHash } from "../../domain/access/tokens";
import { createPublicId } from "../../shared/id";
import { failure, type Failure } from "../identity/result";

export type ApiKeyRecord = {
  id: string;
  prefix: string;
  scopes: string[];
  revokedAt: Date | null;
};

export async function createApiKey(
  sql: Sql,
  input: {
    ownerType: "merchant" | "buyer";
    ownerId: string;
    loggedIn: boolean;
    authorizationPage: boolean;
  },
): Promise<{ ok: true; id: string; secret: string; prefix: string } | Failure> {
  if (!apiKeyAllowed(input)) {
    return failure(403, "forbidden", "请在登录后的账号页创建密钥。");
  }
  const page: AuthorizationPage = input.ownerType === "merchant" ? "merchant" : "buyer";
  const scopes = fixedApprovalScopes(page);
  const secret = `${apiKeyPrefix}${randomBytes(32).toString("base64url")}`;
  const id = createPublicId("apiKey");
  const prefix = secret.slice(0, 12);
  await sql`
    INSERT INTO api_keys (id, owner_type, owner_id, prefix, hash, scopes)
    VALUES (${id}, ${input.ownerType}, ${input.ownerId}, ${prefix}, ${tokenHash(secret)}, ${scopes})
  `;
  return { ok: true, id, secret, prefix };
}

export async function revokeApiKey(
  sql: Sql,
  input: { keyId: string; ownerId: string },
): Promise<{ ok: true } | Failure> {
  const rows = await sql<{ id: string }[]>`
    UPDATE api_keys
    SET revoked_at = now(), updated_at = now()
    WHERE id = ${input.keyId} AND owner_id = ${input.ownerId} AND revoked_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) {
    return failure(404, "not_found", "密钥不存在。");
  }
  return { ok: true };
}

export async function listApiKeys(sql: Sql, ownerId: string): Promise<ApiKeyRecord[]> {
  return sql<ApiKeyRecord[]>`
    SELECT id, prefix, scopes, revoked_at AS "revokedAt"
    FROM api_keys
    WHERE owner_id = ${ownerId}
    ORDER BY created_at
  `;
}

export async function findApiKeyBySecret(
  sql: Sql,
  secret: string,
): Promise<{
  id: string;
  ownerType: "merchant" | "buyer";
  ownerId: string;
  scopes: string[];
} | null> {
  const rows = await sql<
    { id: string; ownerType: "merchant" | "buyer"; ownerId: string; scopes: string[] }[]
  >`
    SELECT id, owner_type AS "ownerType", owner_id AS "ownerId", scopes
    FROM api_keys
    WHERE hash = ${tokenHash(secret)} AND revoked_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}
