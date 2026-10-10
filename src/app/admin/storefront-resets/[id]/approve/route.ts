import { ensureSuperAdmin, findAdmin } from "../../../../../app-services/identity/admin";
import { appRuntime, readCookie, redirectTo } from "../../../../../app-services/identity/runtime";
import { adminCookie, readSession } from "../../../../../app-services/identity/session";
import { executeStorefrontReset } from "../../../../../app-services/storefront/reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: runtime.env.ADMIN_PHONE,
    password: runtime.env.ADMIN_PASSWORD,
  });
  const token = readCookie(request, adminCookie);
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  const admin = session?.kind === "admin" ? await findAdmin(runtime.sql) : null;
  if (admin === null || session === null || session.kind !== "admin") {
    return redirectTo(`/admin/storefront-resets/${id}?notice=${encodeURIComponent("请先登录。")}`);
  }
  const executed = await executeStorefrontReset(id, "admin");
  const notice = executed.ok ? "店面已重置为默认页。" : executed.message;
  return redirectTo(`/admin/storefront-resets/${id}?notice=${encodeURIComponent(notice)}`);
}
