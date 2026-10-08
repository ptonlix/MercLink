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
        grant_types: ["refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        response_types: [],
        redirect_uris: [],
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
        successSource(ctx: { body?: string }) {
          ctx.body = deviceApprovalSuccessPage();
          return Promise.resolve();
        },
        userCodeInputSource(
          ctx: { body?: string },
          form: string,
          _out: unknown,
          err?: { userCode?: string; name?: string },
        ) {
          ctx.body = devicePromptPage("输入设备码", deviceCodeMessage(err), form);
          return Promise.resolve();
        },
        userCodeConfirmSource(
          ctx: { body?: string },
          form: string,
          _client: unknown,
          _info: unknown,
          userCode: string,
        ) {
          ctx.body = devicePromptPage(
            "确认设备码",
            `请确认短码 ${userCode}。确认后继续登录或注册，并批准这次授权。`,
            form,
          );
          return Promise.resolve();
        },
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

export async function requestedInteractionScopes(input: {
  provider: Provider;
  cookieHeader: string;
}): Promise<readonly string[]> {
  const details = await input.provider.interactionDetails(
    interactionRequest(input.cookieHeader),
    interactionResponse(),
  );
  const scope = details.params?.scope;
  return typeof scope === "string" ? scope.split(" ").filter((item) => item.length > 0) : [];
}

export async function finishInteraction(input: {
  provider: Provider;
  cookieHeader: string;
  result: { login: { accountId: string }; consent: { grantId: string } };
}): Promise<string> {
  return input.provider.interactionResult(
    interactionRequest(input.cookieHeader),
    interactionResponse(),
    input.result,
  );
}

function interactionRequest(cookieHeader: string): {
  headers: { cookie: string };
  method: "GET";
  url: "/authorize/finish";
  socket: { encrypted: false };
} {
  return {
    headers: { cookie: cookieHeader },
    method: "GET",
    url: "/authorize/finish",
    socket: { encrypted: false },
  };
}

function interactionResponse(): {
  setHeader: () => undefined;
  getHeader: () => undefined;
  end: () => undefined;
} {
  return {
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
}

function deviceCodeMessage(err: { userCode?: string; name?: string } | undefined): string {
  if (err === undefined) {
    return "输入 Agent 显示的短码。短码几分钟后失效。";
  }
  if (err.name === "AbortedError") {
    return "这次授权已取消。";
  }
  if (err.userCode !== undefined || err.name === "NoCodeError") {
    return "短码不正确、已过期，或已经提交过。请向 Agent 重新要一个短码，不要重复提交。";
  }
  return "处理失败，请向 Agent 重新要一个短码。";
}

export function devicePromptPage(title: string, message: string, form: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f3;color:#2f3437;font-family:"Avenir Next","PingFang SC","Noto Sans SC",sans-serif}.sheet{width:min(28rem,calc(100% - 2rem))}h1{margin:.2rem 0 .8rem;font-size:2rem;font-weight:500}form,button{margin-top:1rem}</style></head><body><main class="sheet"><p>MercLink</p><h1>${safeTitle}</h1><p>${safeMessage}</p>${form}</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deviceApprovalSuccessPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>批准成功</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:rgba(47,52,55,.45);color:#2f3437;font-family:"Avenir Next","PingFang SC","Noto Sans SC",sans-serif}.dialog{width:min(28rem,calc(100% - 2rem));background:#f7f6f3;border-radius:8px;padding:2rem 1.5rem}h1{margin:.2rem 0 .8rem;font-size:2rem;font-weight:500}p{margin:.4rem 0;line-height:1.6}</style></head><body><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="approved-title"><p>MercLink</p><h1 id="approved-title">批准成功</h1><p>Agent 可以继续获取访问令牌。你可以关闭这个页面。</p></div></body></html>`;
}

export function missingInteraction(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "SessionNotFound"
  );
}

export async function loadSigningJwk(sql: Sql): Promise<Record<string, unknown>> {
  const existing = await readSigningJwk(sql);
  if (existing !== undefined) {
    return existing;
  }
  const generated = createSigningJwk();
  const kid = typeof generated.kid === "string" ? generated.kid : randomBytes(8).toString("hex");
  const payload = JSON.parse(JSON.stringify(generated)) as Record<string, string>;
  await sql.begin(async (tx) => {
    await tx`LOCK TABLE oauth_signing_keys IN SHARE ROW EXCLUSIVE MODE`;
    await tx`
      INSERT INTO oauth_signing_keys (kid, jwk)
      SELECT ${kid}, ${tx.json(payload)}
      WHERE NOT EXISTS (SELECT 1 FROM oauth_signing_keys)
    `;
  });
  const stored = await readSigningJwk(sql);
  if (stored === undefined) {
    throw new Error("oauth signing key was not stored");
  }
  return stored;
}

async function readSigningJwk(sql: Sql): Promise<Record<string, unknown> | undefined> {
  const rows = await sql<{ jwk: Record<string, unknown> }[]>`
    SELECT jwk FROM oauth_signing_keys ORDER BY created_at, kid LIMIT 1
  `;
  return rows[0]?.jwk;
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
