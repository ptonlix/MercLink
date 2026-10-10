import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { loadAuthorizeAppearance } from "../../../app-services/storefront/authorize";
import { findBuyerById, safeBuyerPhone } from "../../../app-services/identity/buyers";
import { appRuntime } from "../../../app-services/identity/runtime";
import { accountCookie, readSession } from "../../../app-services/identity/session";
import { devStubsEnabled } from "../../../shared/dev-stubs";
import { buyerCaptchaMarkup } from "../captcha-markup";
import { AuthorizeAppearance, BuyerAuthorizeView, type BuyerAuthorizeStep } from "../views";
import "../authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "买家授权" };

export default async function BuyerAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; mode?: string; step?: string; phone?: string }>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const runtime = appRuntime();
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(accountCookie)?.value;
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
  const buyer =
    session?.kind === "account" && session.ownerType === "buyer"
      ? await findBuyerById(runtime.sql, session.ownerId)
      : null;
  const queryPhone = safeBuyerPhone(params.phone);
  const phone = buyer === null ? queryPhone : buyer.phone;
  const step = buyer === null ? requestedStep(params.step, queryPhone) : "approve";
  const mode = params.mode === "login" ? "login" : "register";
  const devStubs = devStubsEnabled(process.env);
  const captchaToken = randomUUID();
  const appearance = await loadAuthorizeAppearance({
    kind: "buyer",
    step,
    notice: params.notice ?? null,
    phone,
    mode,
    pendingApproval: jar.get("_interaction") !== undefined,
    devStubs,
    captchaToken,
    captchaMarkup: buyerCaptchaMarkup(runtime.env.ALIYUN_CAPTCHA_PREFIX),
  });
  if (appearance !== null) {
    return (
      <AuthorizeAppearance
        html={appearance.html}
        injectCaptcha={appearance.injectCaptcha}
        captchaPrefix={runtime.env.ALIYUN_CAPTCHA_PREFIX}
        captchaSceneId={runtime.env.ALIYUN_CAPTCHA_SCENE_ID}
      />
    );
  }
  return (
    <BuyerAuthorizeView
      notice={params.notice ?? null}
      step={step}
      mode={mode}
      phone={phone}
      pendingApproval={jar.get("_interaction") !== undefined}
      captchaPrefix={runtime.env.ALIYUN_CAPTCHA_PREFIX}
      captchaSceneId={runtime.env.ALIYUN_CAPTCHA_SCENE_ID}
      devStubs={devStubs}
      captchaToken={captchaToken}
    />
  );
}

function requestedStep(step: string | undefined, phone: string): BuyerAuthorizeStep {
  if (phone === "") {
    return "phone";
  }
  if (step === "code" || step === "password") {
    return step;
  }
  return "phone";
}
