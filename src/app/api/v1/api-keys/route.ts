import { createApiKey, listApiKeys } from "../../../../app-services/access/keys";
import { appRuntime, readCookie, redirectTo } from "../../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../../app-services/identity/session";
import { apiError } from "../../../../shared/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = accountSession(request);
  if (session === null) {
    return apiError("unauthorized", "请先登录。", 401);
  }
  const keys = await listApiKeys(appRuntime().sql, session.ownerId);
  return Response.json({
    items: keys.map((key) => ({ id: key.id, prefix: key.prefix, revoked: key.revokedAt !== null })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = accountSession(request);
  if (session === null) {
    return apiError("unauthorized", "请先登录。", 401);
  }
  const created = await createApiKey(appRuntime().sql, {
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    loggedIn: true,
    authorizationPage: false,
  });
  if (!created.ok) {
    return apiError(created.error, created.message, created.status);
  }
  const accepts = request.headers.get("accept") ?? "";
  if (accepts.includes("text/html") || request.headers.get("content-type")?.includes("form")) {
    return redirectTo(`/authorize/account?secret=${encodeURIComponent(created.secret)}`);
  }
  return Response.json({ id: created.id, secret: created.secret, prefix: created.prefix });
}

function accountSession(
  request: Request,
): { ownerType: "merchant" | "buyer"; ownerId: string } | null {
  const runtime = appRuntime();
  const token = readCookie(request, accountCookie);
  if (token === undefined) {
    return null;
  }
  const session = readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  if (session === null || session.kind !== "account") {
    return null;
  }
  return { ownerType: session.ownerType, ownerId: session.ownerId };
}
