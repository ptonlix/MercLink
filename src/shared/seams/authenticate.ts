import type { Actor } from "../actor";
import { apiError } from "../errors";

export const protectedResourcePath = "/.well-known/oauth-protected-resource";

export type AuthenticateResult = { ok: true; actor: Actor } | { ok: false; response: Response };

export type Authenticator = (request: Request) => Promise<AuthenticateResult> | AuthenticateResult;

let authenticator: Authenticator | undefined;

export function registerAuthenticator(impl: Authenticator): void {
  authenticator = impl;
}

export function resetAuthenticator(): void {
  authenticator = undefined;
}

function metadataUrl(request: Request): string {
  try {
    return new URL(protectedResourcePath, request.url).toString();
  } catch {
    return protectedResourcePath;
  }
}

function challenge(request: Request, message: string): Response {
  return apiError("unauthorized", message, 401, {
    "WWW-Authenticate": `Bearer realm="merclink", resource_metadata="${metadataUrl(request)}"`,
  });
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header === null) {
    return undefined;
  }
  return /^Bearer\s+(\S+)/i.exec(header)?.[1];
}

export async function authenticate(request: Request): Promise<AuthenticateResult> {
  const token = bearerToken(request);
  if (token === undefined || token.length === 0) {
    return { ok: false, response: challenge(request, "需要登录。") };
  }
  if (authenticator === undefined) {
    return { ok: false, response: challenge(request, "认证服务尚未就绪。") };
  }
  return authenticator(request);
}
