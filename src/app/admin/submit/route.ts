import {
  authenticateAdmin,
  changeAdminPassword,
  ensureSuperAdmin,
} from "../../../app-services/identity/admin";
import {
  appRuntime,
  formValue,
  readCookie,
  redirectTo,
} from "../../../app-services/identity/runtime";
import {
  adminCookie,
  readSession,
  sessionTtlSeconds,
  signSession,
} from "../../../app-services/identity/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: runtime.env.ADMIN_PHONE,
    password: runtime.env.ADMIN_PASSWORD,
  });
  const form = await request.formData();
  const intent = formValue(form, "intent");
  const token = readCookie(request, adminCookie);
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());

  if (intent === "login") {
    const result = await authenticateAdmin(runtime.sql, {
      phone: formValue(form, "phone"),
      password: formValue(form, "password"),
    });
    if (!result.ok) {
      return redirectTo(`/admin?notice=${encodeURIComponent(result.message)}`);
    }
    const signed = signSession(
      {
        kind: "admin",
        adminId: result.admin.id,
        exp: Math.floor(runtime.clock.now().getTime() / 1000) + sessionTtlSeconds,
      },
      runtime.env.OAUTH_SIGNING_SECRET,
    );
    return redirectTo("/admin", { name: adminCookie, value: signed, path: "/admin" });
  }

  if (session === null || session.kind !== "admin") {
    return redirectTo("/admin?notice=" + encodeURIComponent("请先登录。"));
  }

  if (intent === "password") {
    const result = await changeAdminPassword(runtime.sql, {
      adminId: session.adminId,
      currentPassword: formValue(form, "currentPassword"),
      nextPassword: formValue(form, "nextPassword"),
    });
    return redirectTo(
      `/admin?notice=${encodeURIComponent(result.ok ? "密码已修改。" : result.message)}`,
    );
  }
  return redirectTo("/admin");
}
