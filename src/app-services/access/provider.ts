import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import Provider from "oidc-provider";
import type { Sql } from "../../db/client";
import { selectAuthorizationPage } from "../../domain/access/scopes";
import {
  accessTokenTtlSeconds,
  deviceCodeTtlSeconds,
  refreshTokenTtlSeconds,
} from "../../domain/access/tokens";
import { createOidcAdapter } from "./adapter";

export const agentClientId = "merclink-agent";
export const agentRedirectUri = "https://agent.example/callback";

const providerScopes = [
  "openid",
  "offline_access",
  "field:write",
  "product:write",
  "product:read",
  "order:read",
  "order:write",
];

export type AccountLookup = {
  isActive(accountId: string): Promise<boolean>;
};

export async function createAccessProvider(input: {
  issuer: string;
  cookieSecret: string;
  sql: Sql;
  accounts: AccountLookup;
}): Promise<Provider> {
  const jwk = await loadSigningJwk(input.sql);
  return new Provider(input.issuer, {
    adapter: createOidcAdapter(input.sql),
    clients: [
      {
        client_id: agentClientId,
        token_endpoint_auth_method: "none",
        grant_types: [
          "authorization_code",
          "refresh_token",
          "urn:ietf:params:oauth:grant-type:device_code",
        ],
        response_types: ["code"],
        redirect_uris: [agentRedirectUri],
        scope: providerScopes.join(" "),
      },
    ],
    scopes: providerScopes,
    cookies: { keys: [input.cookieSecret] },
    jwks: { keys: [jwk] },
    pkce: { required: () => true },
    issueRefreshToken: () => Promise.resolve(true),
    rotateRefreshToken: () => true,
    expiresWithSession: () => Promise.resolve(false),
    responseTypes: ["code"],
    renderError(
      ctx: { type: string; body: unknown },
      out: { error: string; error_description?: string },
    ) {
      ctx.type = "json";
      ctx.body = { error: out.error, error_description: out.error_description ?? out.error };
    },
    features: {
      devInteractions: { enabled: false },
      deviceFlow: {
        enabled: true,
        charset: "base-20",
        mask: "****-****",
      },
    },
    ttl: {
      AccessToken: accessTokenTtlSeconds,
      AuthorizationCode: 60,
      DeviceCode: deviceCodeTtlSeconds,
      Grant: refreshTokenTtlSeconds,
      Interaction: 600,
      Session: 60 * 60,
      RefreshToken: refreshTokenTtlSeconds,
    },
    interactions: {
      url(_ctx: unknown, interaction: { uid: string; params: { scope?: unknown } }) {
        const raw = interaction.params.scope;
        const requested = typeof raw === "string" ? raw.split(" ") : [];
        const page = selectAuthorizationPage(requested);
        const name = page === "merchant" ? "merchant" : "buyer";
        return `/authorize/${name}?uid=${interaction.uid}`;
      },
    },
    findAccount(_ctx: unknown, id: string) {
      return input.accounts.isActive(id).then((active) => {
        if (!active) {
          return undefined;
        }
        return {
          accountId: id,
          claims() {
            return Promise.resolve({ sub: id });
          },
        };
      });
    },
  });
}

export function authorizationIssuer(appBaseUrl: string): string {
  return new URL("/oauth", appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`)
    .toString()
    .replace(/\/$/, "");
}

export async function startAuthorizationServer(input: {
  cookieSecret: string;
  sql: Sql;
  accounts: AccountLookup;
}): Promise<{ provider: Provider; origin: string; close: () => Promise<void> }> {
  const slot: { current?: (req: IncomingMessage, res: ServerResponse) => void } = {};
  const server = createServer((req, res) => {
    const current = slot.current;
    if (current === undefined) {
      res.statusCode = 503;
      res.end();
      return;
    }
    current(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const origin = listenOrigin(server);
  const provider = await createAccessProvider({
    issuer: `${origin}/oauth`,
    cookieSecret: input.cookieSecret,
    sql: input.sql,
    accounts: input.accounts,
  });
  slot.current = (req, res) => {
    const url = req.url ?? "/";
    Object.assign(req, { originalUrl: url });
    if (url === "/oauth" || url.startsWith("/oauth/") || url.startsWith("/oauth?")) {
      req.url = url.slice("/oauth".length) || "/";
    }
    provider.callback()(req, res);
  };
  return {
    provider,
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function listenOrigin(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("authorization server has no port");
  }
  return `http://127.0.0.1:${address.port}`;
}

export async function finishInteraction(input: {
  provider: Provider;
  cookieHeader: string;
  result: { login: { accountId: string }; consent: { grantId: string } };
}): Promise<string> {
  const req = {
    headers: { cookie: input.cookieHeader },
    method: "GET",
    url: "/authorize/finish",
    socket: { encrypted: false },
  };
  const res = {
    setHeader() {
      return undefined;
    },
    getHeader() {
      return undefined;
    },
    end() {
      return undefined;
    },
  };
  return input.provider.interactionResult(req, res, input.result);
}

async function loadSigningJwk(sql: Sql): Promise<Record<string, unknown>> {
  const rows = await sql<{ jwk: Record<string, unknown> }[]>`
    SELECT jwk FROM oauth_signing_keys ORDER BY created_at LIMIT 1
  `;
  const existing = rows[0]?.jwk;
  if (existing !== undefined) {
    return existing;
  }
  const jwk = createSigningJwk();
  const kid = typeof jwk.kid === "string" ? jwk.kid : randomBytes(8).toString("hex");
  await sql`INSERT INTO oauth_signing_keys (kid, jwk) VALUES (${kid}, ${sql.json(JSON.parse(JSON.stringify(jwk)) as Record<string, string>)})`;
  return jwk;
}

function createSigningJwk(): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const exported = privateKey.export({ format: "jwk" });
  return {
    ...exported,
    kid: randomBytes(8).toString("hex"),
    alg: "RS256",
    use: "sig",
  };
}
