import type { ReactNode } from "react";
import { ensureSuperAdmin, findAdmin } from "../../app-services/identity/admin";
import { appRuntime } from "../../app-services/identity/runtime";
import { readSession, adminCookie } from "../../app-services/identity/session";
import { AdminLoginView, AdminView } from "../authorize/views";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "管理" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: runtime.env.ADMIN_PHONE,
    password: runtime.env.ADMIN_PASSWORD,
  });
  const header = await headerCookie();
  const session =
    header === undefined
      ? null
      : readSession(header, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  const admin = session?.kind === "admin" ? await findAdmin(runtime.sql) : null;
  if (admin === null || session === null || session.kind !== "admin") {
    return <AdminLoginView notice={params.notice ?? null} />;
  }
  return <AdminView notice={params.notice ?? null} />;
}

async function headerCookie(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return jar.get(adminCookie)?.value;
}
