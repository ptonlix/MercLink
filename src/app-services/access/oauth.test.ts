import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { withIdentityDatabase } from "../identity/database";
import { changeAdminPassword, ensureSuperAdmin } from "../identity/admin";
import { provisionMerchant } from "../identity/merchants";
import { hashPassword } from "../identity/passwords";
import { resetAuthenticator } from "../../shared/seams/authenticate";
import { resetDefaultCatalog } from "../../shared/seams/default-catalog";
import { createPublicId } from "../../shared/id";
import { guardApiRequest, registerAccessAuthenticator } from "./authenticate";
import {
  approveAgent,
  parseAccountId,
  presentedRefreshHash,
  refreshHashStored,
  revokeGrant,
} from "./grants";
import { createApiKey, revokeApiKey } from "./keys";
import { protectedResourceMetadata } from "./metadata";
import { agentClientId, agentRedirectUri, startAuthorizationServer } from "./provider";
import { tokenHash } from "../../domain/access/tokens";
import { dispatchOidc } from "./dispatch";

afterEach(() => {
  resetAuthenticator();
  resetDefaultCatalog();
});

describe("oauth 2.1", () => {
  it("rejects authorization code without PKCE and does not offer the password grant", async () => {
    await withIdentityDatabase(async (sql) => {
      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      try {
        const redirect = encodeURIComponent(agentRedirectUri);
        const missing = await fetch(
          `${started.origin}/oauth/auth?client_id=${agentClientId}&response_type=code&redirect_uri=${redirect}&scope=order:write`,
          { redirect: "manual" },
        );
        const missingLocation = missing.headers.get("location") ?? "";
        expect(missingLocation).toContain("error=invalid_request");
        expect(decodeURIComponent(missingLocation)).toContain("PKCE");

        const password = await fetch(`${started.origin}/oauth/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: agentClientId,
            username: "13800138000",
            password: "secret-password",
          }),
        });
        expect(password.status).toBe(400);
        await expect(password.json()).resolves.toMatchObject({ error: "unsupported_grant_type" });

        const implicit = await fetch(
          `${started.origin}/oauth/auth?client_id=${agentClientId}&response_type=token&redirect_uri=${redirect}&scope=order:write&code_challenge=abc&code_challenge_method=S256`,
          { redirect: "manual" },
        );
        expect(implicit.headers.get("location") ?? "").toContain("unsupported_response_type");
      } finally {
        await started.close();
      }
    });
  });

  it("rotates refresh tokens, stores only the hash, and revokes one grant", async () => {
    await withIdentityDatabase(async (sql) => {
      const buyerId = createPublicId("buyer");
      await sql`
        INSERT INTO buyers (id, phone, password_hash, phone_verified_at)
        VALUES (${buyerId}, '13800138000', 'hash', now())
      `;
      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      try {
        const first = await issueBuyerTokens(started, sql, buyerId, "order:write order:read");
        const second = await issueBuyerTokens(started, sql, buyerId, "order:write order:read");
        expect(first.expires_in).toBe(900);
        const stored = await refreshHashStored(sql, first.grantId);
        expect(stored).toBe(presentedRefreshHash(first.refresh_token));
        const rawRows = await sql<{ payload: unknown }[]>`
          SELECT payload FROM oidc_records WHERE model = 'RefreshToken'
        `;
        for (const row of rawRows) {
          expect(JSON.stringify(row.payload)).not.toContain(first.refresh_token);
        }

        const rotated = await refresh(started.origin, first.refresh_token);
        expect(rotated.refresh_token).toEqual(expect.any(String));
        const nextRefresh = rotated.refresh_token ?? "";
        expect(nextRefresh).not.toBe(first.refresh_token);
        const reused = await refresh(started.origin, first.refresh_token);
        expect(reused.error).toBe("invalid_grant");

        expect(await revokeGrant(sql, { grantId: first.grantId, ownerId: buyerId })).toBe(true);
        const revoked = await refresh(started.origin, nextRefresh);
        expect(revoked.error).toBe("invalid_grant");
        const other = await refresh(started.origin, second.refresh_token);
        expect(other.access_token).toEqual(expect.any(String));
        expect(parseAccountId(`buyer:${buyerId}`)?.ownerId).toBe(buyerId);
      } finally {
        await started.close();
      }
    });
  });

  it("stores a minute-level device code in PostgreSQL and publishes protected resource metadata", async () => {
    await withIdentityDatabase(async (sql) => {
      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      try {
        const device = await fetch(`${started.origin}/oauth/device/auth`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: agentClientId, scope: "order:write order:read" }),
        });
        const body = (await device.json()) as { expires_in?: number; device_code?: string };
        expect(device.status).toBe(200);
        expect(body.expires_in).toBe(600);
        const rows = await sql<
          { model: string }[]
        >`SELECT model FROM oidc_records WHERE model = 'DeviceCode'`;
        expect(rows).toHaveLength(1);
        expect(protectedResourceMetadata("https://merclink.example").authorization_servers).toEqual(
          ["https://merclink.example/oauth"],
        );
        const bridged = await dispatchOidc(
          started.provider,
          new Request(`${started.origin}/oauth/.well-known/openid-configuration`),
        );
        expect(bridged.status).toBe(200);
      } finally {
        await started.close();
      }
    });
  });

  it("returns 403 for a merchant token on order placement and 401 without a token", async () => {
    await withIdentityDatabase(async (sql) => {
      const admin = await ensureSuperAdmin(sql, {
        phone: "13800138000",
        password: "initial-admin-password",
      });
      await changeAdminPassword(sql, {
        adminId: admin.admin.id,
        currentPassword: "initial-admin-password",
        nextPassword: "changed-admin-password",
      });
      const merchant = await provisionMerchant(sql, {
        adminId: admin.admin.id,
        name: "南风铺",
        phone: "13700137000",
        password: "merchant-password",
      });
      if (!merchant.ok) {
        throw new Error("merchant was not provisioned");
      }
      await sql`UPDATE merchants SET must_change_password = false WHERE id = ${merchant.merchantId}`;
      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      try {
        registerAccessAuthenticator(sql, started.provider);
        const tokens = await issueBuyerTokens(
          started,
          sql,
          merchant.merchantId,
          "field:write product:write",
          "merchant",
        );
        const placed = await guardApiRequest(
          new Request("https://merclink.example/api/v1/orders", {
            method: "POST",
            headers: { authorization: `Bearer ${tokens.access_token}` },
          }),
        );
        expect(placed).toBeInstanceOf(Response);
        if (placed instanceof Response) {
          expect(placed.status).toBe(403);
          await expect(placed.json()).resolves.toMatchObject({ error: "forbidden" });
        }
        const anonymous = await guardApiRequest(
          new Request("https://merclink.example/api/v1/orders", { method: "POST" }),
        );
        expect(anonymous).toBeInstanceOf(Response);
        if (anonymous instanceof Response) {
          expect(anonymous.status).toBe(401);
          expect(anonymous.headers.get("WWW-Authenticate")).toContain(
            "/.well-known/oauth-protected-resource",
          );
        }
        const search = await guardApiRequest(
          new Request("https://merclink.example/api/v1/products"),
        );
        expect(search).toMatchObject({ ok: true, actor: { type: "anonymous" } });
      } finally {
        await started.close();
      }
    });
  });

  it("creates and revokes an API key outside the authorization flow", async () => {
    await withIdentityDatabase(async (sql) => {
      const passwordHash = await hashPassword("buyer-password");
      const buyerId = createPublicId("buyer");
      await sql`
        INSERT INTO buyers (id, phone, password_hash, phone_verified_at)
        VALUES (${buyerId}, '13800138000', ${passwordHash}, now())
      `;
      const created = await createApiKey(sql, {
        ownerType: "buyer",
        ownerId: buyerId,
        loggedIn: true,
        authorizationPage: false,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const refused = await createApiKey(sql, {
        ownerType: "buyer",
        ownerId: buyerId,
        loggedIn: true,
        authorizationPage: true,
      });
      expect(refused).toMatchObject({ ok: false, error: "forbidden" });
      const rows = await sql<
        { hash: string }[]
      >`SELECT hash FROM api_keys WHERE id = ${created.id}`;
      expect(rows[0]?.hash).toBe(tokenHash(created.secret));
      expect(rows[0]?.hash).not.toBe(created.secret);
      expect(await revokeApiKey(sql, { keyId: created.id, ownerId: buyerId })).toEqual({
        ok: true,
      });
    });
  });
});

type Started = Awaited<ReturnType<typeof startAuthorizationServer>>;

async function issueBuyerTokens(
  started: Started,
  sql: Parameters<typeof approveAgent>[0]["sql"],
  ownerId: string,
  scope: string,
  ownerType: "merchant" | "buyer" = "buyer",
): Promise<{ access_token: string; refresh_token: string; expires_in: number; grantId: string }> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirect = encodeURIComponent(agentRedirectUri);
  const auth = await fetch(
    `${started.origin}/oauth/auth?client_id=${agentClientId}&response_type=code&redirect_uri=${redirect}&scope=${encodeURIComponent(scope)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`,
    { redirect: "manual" },
  );
  expect(auth.status).toBe(303);
  const location = auth.headers.get("location") ?? "";
  expect(location).toContain(ownerType === "merchant" ? "/authorize/merchant" : "/authorize/buyer");
  const cookieHeader = auth.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
  const approved = await approveAgent({
    provider: started.provider,
    sql,
    cookieHeader,
    page: ownerType,
    ownerType,
    ownerId,
  });
  const resumed = await fetch(approved.returnTo, {
    redirect: "manual",
    headers: { cookie: cookieHeader },
  });
  const code = new URL(
    resumed.headers.get("location") ?? "https://agent.example/callback",
  ).searchParams.get("code");
  expect(code).toEqual(expect.any(String));
  const tokenResponse = await fetch(`${started.origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: agentClientId,
      code: code ?? "",
      redirect_uri: agentRedirectUri,
      code_verifier: verifier,
    }),
  });
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    error?: string;
  };
  expect(tokenResponse.status).toBe(200);
  return { ...tokens, grantId: approved.grantId };
}

async function refresh(
  origin: string,
  refreshToken: string,
): Promise<{ refresh_token?: string; access_token?: string; error?: string }> {
  const response = await fetch(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: agentClientId,
      refresh_token: refreshToken,
    }),
  });
  return (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  };
}
