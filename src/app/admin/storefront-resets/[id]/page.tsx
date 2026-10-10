import type { ReactNode } from "react";
import { ensureSuperAdmin, findAdmin } from "../../../../app-services/identity/admin";
import { appRuntime } from "../../../../app-services/identity/runtime";
import { adminCookie, readSession } from "../../../../app-services/identity/session";
import { readStorefrontReset } from "../../../../app-services/storefront/reset";
import { storefrontRuntime } from "../../../../app-services/storefront/runtime";
import { AdminLoginView } from "../../../authorize/views";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "批准重置店面" };

export default async function StorefrontResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const query = await searchParams;
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: runtime.env.ADMIN_PHONE,
    password: runtime.env.ADMIN_PASSWORD,
  });
  const token = await headerCookie();
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  const admin = session?.kind === "admin" ? await findAdmin(runtime.sql) : null;
  if (admin === null || session === null || session.kind !== "admin") {
    return (
      <AdminLoginView
        notice={query.notice ?? "请先登录后再批准重置。"}
        next={`/admin/storefront-resets/${id}`}
      />
    );
  }
  if (storefrontRuntime() === undefined) {
    return (
      <main className="ml-auth">
        <p>重置暂时不可用。</p>
      </main>
    );
  }
  const request = await readStorefrontReset(id);
  if (!request.ok) {
    return (
      <main className="ml-auth">
        <p>{request.message}</p>
      </main>
    );
  }
  return (
    <main className="ml-auth">
      <p className="kicker">管理</p>
      <h1>批准重置店面</h1>
      <p className="lede">
        这会删除全部已上传店面发布和对象文件，并把线上页面恢复为内置默认页。商品、价格和店铺资料不会删除。
      </p>
      <p>
        请求 {request.value.id}，当前状态 {request.value.status}。
      </p>
      {query.notice === undefined ? null : <p className="notice">{query.notice}</p>}
      {request.value.status === "pending" ? (
        <form action={`/admin/storefront-resets/${id}/approve`} method="post">
          <button type="submit">批准并执行重置</button>
        </form>
      ) : (
        <p>此请求已经处理，不能再次执行。</p>
      )}
    </main>
  );
}

async function headerCookie(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get(adminCookie)?.value;
}
