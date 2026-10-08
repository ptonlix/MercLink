import { createApiKey, listApiKeys } from "../../../../app-services/access/keys";
import { appRuntime, readCookie, redirectTo } from "../../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../../app-services/identity/session";
import { apiFailure, apiSuccess } from "../../../../shared/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = accountSession(request);
  if (session === null) {
    return apiFailure("unauthorized", "请先登录。", { request });
  }
  const keys = await listApiKeys(appRuntime().sql, session.ownerId);
  return apiSuccess(
    {
      items: keys.map((key) => ({
        id: key.id,
        prefix: key.prefix,
        revoked: key.revokedAt !== null,
      })),
    },
    { request },
  );
}

export async function POST(request: Request): Promise<Response> {
  const session = accountSession(request);
  if (session === null) {
    return apiFailure("unauthorized", "请先登录。", { request });
  }
  const created = await createApiKey(appRuntime().sql, {
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    loggedIn: true,
    authorizationPage: false,
  });
  if (!created.ok) {
    return apiFailure(created.error, created.message, { request });
  }
  const accepts = request.headers.get("accept") ?? "";
  if (accepts.includes("text/html") || request.headers.get("content-type")?.includes("form")) {
    return redirectTo(`/authorize/account?secret=${encodeURIComponent(created.secret)}`);
  }
  return apiSuccess(
    { id: created.id, secret: created.secret, prefix: created.prefix },
    { status: 201, request },
  );
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
