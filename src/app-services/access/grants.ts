import Provider from "oidc-provider";
import type { Sql } from "../../db/client";
import { fixedApprovalScopes, type AuthorizationPage } from "../../domain/access/scopes";
import { tokenHash } from "../../domain/access/tokens";
import { agentClientId, finishInteraction } from "./provider";

function accountIdFor(ownerType: "merchant" | "buyer", ownerId: string): string {
  return `${ownerType}:${ownerId}`;
}

export function parseAccountId(
  value: string,
): { ownerType: "merchant" | "buyer"; ownerId: string } | null {
  const separator = value.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const ownerType = value.slice(0, separator);
  const ownerId = value.slice(separator + 1);
  if ((ownerType !== "merchant" && ownerType !== "buyer") || ownerId.length === 0) {
    return null;
  }
  return { ownerType, ownerId };
}

export async function approveAgent(input: {
  provider: Provider;
  sql: Sql;
  cookieHeader: string;
  page: AuthorizationPage;
  ownerType: "merchant" | "buyer";
  ownerId: string;
  clientName?: string;
}): Promise<{ grantId: string; returnTo: string; scopes: readonly string[] }> {
  const scopes = fixedApprovalScopes(input.page);
  const accountId = accountIdFor(input.ownerType, input.ownerId);
  const grant = new input.provider.Grant({ accountId, clientId: agentClientId });
  grant.addOIDCScope(scopes.join(" "));
  const grantId = await grant.save();
  await input.sql`
    INSERT INTO oauth_grants (id, owner_type, owner_id, client_name, scopes)
    VALUES (
      ${grantId}, ${input.ownerType}, ${input.ownerId}, ${input.clientName ?? agentClientId}, ${scopes}
    )
  `;
  const returnTo = await finishInteraction({
    provider: input.provider,
    cookieHeader: input.cookieHeader,
    result: { login: { accountId }, consent: { grantId } },
  });
  return { grantId, returnTo, scopes };
}

export async function revokeGrant(
  sql: Sql,
  input: { grantId: string; ownerId: string },
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE oauth_grants
    SET revoked_at = now(), updated_at = now()
    WHERE id = ${input.grantId} AND owner_id = ${input.ownerId} AND revoked_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) {
    return false;
  }
  await sql`DELETE FROM oidc_records WHERE grant_id = ${input.grantId}`;
  return true;
}

export async function refreshHashStored(sql: Sql, grantId: string): Promise<string | null> {
  const rows = await sql<{ refresh_hash: string | null }[]>`
    SELECT refresh_hash FROM oauth_grants WHERE id = ${grantId}
  `;
  return rows[0]?.refresh_hash ?? null;
}

export function presentedRefreshHash(token: string): string {
  return tokenHash(token);
}
