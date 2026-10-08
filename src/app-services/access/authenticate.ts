import Provider from "oidc-provider";
import type { Sql } from "../../db/client";
import { isApiKeyToken } from "../../domain/access/api-key";
import {
  roleDecision,
  isPublicProductRead,
  anonymousProductSearch,
} from "../../domain/access/guard";
import { accountCanAuthenticate } from "../identity/can-authenticate";
import { apiFailure } from "../../shared/errors";
import {
  authenticate,
  registerAuthenticator,
  type AuthenticateResult,
} from "../../shared/seams/authenticate";
import { buyerActor, isScope, merchantActor, scriptActor, type Actor } from "../../shared/actor";
import { findApiKeyBySecret } from "./keys";
import { parseAccountId } from "./grants";

function createRequestAuthenticator(sql: Sql, provider: Provider) {
  return async function requestAuthenticator(request: Request): Promise<AuthenticateResult> {
    const token = bearer(request);
    if (token === undefined) {
      return { ok: false, response: apiFailure("unauthorized", "需要登录。", { request }) };
    }
    if (isApiKeyToken(token)) {
      const key = await findApiKeyBySecret(sql, token);
      if (key === null || !(await ownerActive(sql, key.ownerType, key.ownerId))) {
        return { ok: false, response: apiFailure("unauthorized", "密钥无效。", { request }) };
      }
      return {
        ok: true,
        actor: scriptActor({
          ownerType: key.ownerType,
          ownerId: key.ownerId,
          keyId: key.id,
          scopes: key.scopes,
        }),
      };
    }
    const access = await provider.AccessToken.find(token);
    const account = access?.accountId === undefined ? null : parseAccountId(access.accountId);
    if (access === undefined || account === null || access.grantId === undefined) {
      return { ok: false, response: apiFailure("unauthorized", "令牌无效。", { request }) };
    }
    if (!(await grantActive(sql, access.grantId, account.ownerType, account.ownerId))) {
      return { ok: false, response: apiFailure("unauthorized", "令牌已撤销。", { request }) };
    }
    const scopes = (access.scope ?? "").split(" ").filter((scope) => isScope(scope));
    const actor: Actor =
      account.ownerType === "merchant"
        ? merchantActor({ merchantId: account.ownerId, grantId: access.grantId, scopes })
        : buyerActor({ buyerId: account.ownerId, grantId: access.grantId, scopes });
    return { ok: true, actor };
  };
}

export function registerAccessAuthenticator(sql: Sql, provider: Provider): void {
  registerAuthenticator(createRequestAuthenticator(sql, provider));
}

export async function guardApiRequest(
  request: Request,
): Promise<Response | { ok: true; actor: Actor }> {
  const url = new URL(request.url);
  if (isPublicProductRead(request.method, url.pathname) && bearer(request) === undefined) {
    return { ok: true, actor: anonymousProductSearch() };
  }
  const result = await authenticate(request);
  if (!result.ok) {
    return result.response;
  }
  const decision = roleDecision(result.actor, request.method, url.pathname);
  if (!decision.ok) {
    return apiFailure(decision.error, decision.message, { request });
  }
  return result;
}

function bearer(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header === null) {
    return undefined;
  }
  return /^Bearer\s+(\S+)/i.exec(header)?.[1];
}

async function grantActive(
  sql: Sql,
  grantId: string,
  ownerType: "merchant" | "buyer",
  ownerId: string,
): Promise<boolean> {
  const rows = await sql<{ revoked_at: Date | null }[]>`
    SELECT revoked_at FROM oauth_grants
    WHERE id = ${grantId} AND owner_type = ${ownerType} AND owner_id = ${ownerId}
  `;
  if (rows[0]?.revoked_at !== null && rows[0] !== undefined) {
    return false;
  }
  if (rows[0] === undefined) {
    return false;
  }
  return ownerActive(sql, ownerType, ownerId);
}

function ownerActive(sql: Sql, ownerType: "merchant" | "buyer", ownerId: string): Promise<boolean> {
  return accountCanAuthenticate(sql, { ownerType, ownerId });
}
