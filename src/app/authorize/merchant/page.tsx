import type { ReactNode } from "react";
import { findMerchant } from "../../../app-services/identity/merchants";
import { appRuntime } from "../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../app-services/identity/session";
import { MerchantAuthorizeView } from "../views";
import "../authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "商家登录" };

export default async function MerchantAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const runtime = appRuntime();
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(accountCookie)?.value;
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  const merchant =
    session?.kind === "account" && session.ownerType === "merchant"
      ? await findMerchant(runtime.sql, session.ownerId)
      : null;
  return (
    <MerchantAuthorizeView
      notice={params.notice ?? null}
      mustChangePassword={merchant?.mustChangePassword ?? false}
    />
  );
}
