import { afterEach, describe, expect, it } from "vitest";
import { withIdentityDatabase } from "../identity/database";
import { changeAdminPassword, ensureSuperAdmin } from "../identity/admin";
import { ensureStoreMerchant } from "../identity/merchants";
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
import { issueDeviceTokens } from "../../../tests/support/device-tokens";
import { agentClientId, startAuthorizationServer } from "./provider";
import { tokenHash } from "../../domain/access/tokens";
import { dispatchOidc } from "./dispatch";

afterEach(() => {
  resetAuthenticator();
  resetDefaultCatalog();
});

describe("oauth 2.1", () => {
  it("does not offer authorization-code, password, or implicit grants", async () => {
    await withIdentityDatabase(async (sql) => {
      const started = await startAuthorizationServer({
        sql,
        cookieSecret: "oauth-signing-secret-value",
        accounts: { isActive: () => Promise.resolve(true) },
      });
      try {
        const code = await tokenGrant(started.origin, {
          grant_type: "authorization_code",
          client_id: agentClientId,
          code: "not-a-code",
          redirect_uri: "https://callback.invalid/token",
        });
        expect(code.status).toBe(400);
        await expect(code.json()).resolves.toMatchObject({ error: "invalid_request" });

        const password = await tokenGrant(started.origin, {
          grant_type: "password",
          client_id: agentClientId,
          username: "13800138000",
          password: "secret-password",
        });
        expect(password.status).toBe(400);
        await expect(password.json()).resolves.toMatchObject({ error: "unsupported_grant_type" });

        for (const responseType of ["token", "id_token", "code token"]) {
          const rejected = await fetch(
            `${started.origin}/oauth/auth?${new URLSearchParams({
              client_id: agentClientId,
              response_type: responseType,
              scope: "openid",
            })}`,
            { redirect: "manual" },
          );
          const location = rejected.headers.get("location") ?? "";
          const body = await rejected.text();
          const rendered = `${String(rejected.status)} ${location} ${body}`;
          expect(rendered).not.toContain("access_token=");
          expect(rendered).not.toContain("id_token=");
          expect(rejected.ok).toBe(false);
          expect(rendered).toMatch(/unsupported_response_type|invalid_request|invalid_client/);
        }
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
      const merchant = await ensureStoreMerchant(sql, admin.admin);
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
          await expect(placed.json()).resolves.toMatchObject({ code: 40300, data: null });
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

function issueBuyerTokens(
  started: Started,
  sql: Parameters<typeof approveAgent>[0]["sql"],
  ownerId: string,
  scope: string,
  ownerType: "merchant" | "buyer" = "buyer",
): Promise<{ access_token: string; refresh_token: string; expires_in: number; grantId: string }> {
  return issueDeviceTokens({
    origin: started.origin,
    provider: started.provider,
    sql,
    ownerId,
    ownerType,
    scope,
  });
}

function tokenGrant(origin: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
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
