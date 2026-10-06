import { revokeApiKey } from "../../../../../app-services/access/keys";
import { appRuntime, readCookie, redirectTo } from "../../../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../../../app-services/identity/session";
import { apiError } from "../../../../../shared/errors";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return revoke(request, context, false);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return revoke(request, context, true);
}

async function revoke(
  request: Request,
  context: { params: Promise<{ id: string }> },
  form: boolean,
): Promise<Response> {
  const runtime = appRuntime();
  const token = readCookie(request, accountCookie);
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  if (session === null || session.kind !== "account") {
    return apiError("unauthorized", "请先登录。", 401);
  }
  const params = await context.params;
  const result = await revokeApiKey(runtime.sql, { keyId: params.id, ownerId: session.ownerId });
  if (!result.ok) {
    return apiError(result.error, result.message, result.status);
  }
  if (form) {
    return redirectTo("/authorize/account");
  }
  return new Response(null, { status: 204 });
}
