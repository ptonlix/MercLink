import type { ReactNode } from "react";
import { loadAuthorizeAppearance } from "../../../app-services/storefront/authorize";
import { findMerchant } from "../../../app-services/identity/merchants";
import { appRuntime } from "../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../app-services/identity/session";
import { AuthorizeAppearance, MerchantAuthorizeView } from "../views";
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
  const step =
    merchant === null ? "login" : merchant.mustChangePassword ? "change-password" : "approve";
  const appearance = await loadAuthorizeAppearance({
    kind: "merchant",
    step,
    notice: params.notice ?? null,
    accountName: merchant?.name ?? "",
    accountPhone: merchant?.phone ?? "",
  });
  if (appearance !== null) {
    return (
      <AuthorizeAppearance
        html={appearance.html}
        injectCaptcha={false}
        captchaPrefix=""
        captchaSceneId=""
      />
    );
  }
  return (
    <MerchantAuthorizeView
      notice={params.notice ?? null}
      mustChangePassword={merchant?.mustChangePassword ?? false}
      account={merchant === null ? null : { name: merchant.name, phone: merchant.phone }}
    />
  );
}
