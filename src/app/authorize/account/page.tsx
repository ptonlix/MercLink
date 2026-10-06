import type { ReactNode } from "react";
import { listApiKeys } from "../../../app-services/access/keys";
import { appRuntime } from "../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../app-services/identity/session";
import { AccountKeyView } from "../views";
import "../authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "脚本密钥" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const runtime = appRuntime();
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(accountCookie)?.value;
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  if (session === null || session.kind !== "account") {
    return (
      <main className="sheet">
        <h1>请先登录</h1>
        <p>登录后才能创建 API Key。</p>
      </main>
    );
  }
  const keys = await listApiKeys(runtime.sql, session.ownerId);
  return (
    <AccountKeyView
      secret={params.secret ?? null}
      keys={keys.map((key) => ({
        id: key.id,
        prefix: key.prefix,
        revoked: key.revokedAt !== null,
      }))}
    />
  );
}
