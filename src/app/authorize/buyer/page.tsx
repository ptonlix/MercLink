import type { ReactNode } from "react";
import { loadEnv } from "../../../shared/env";
import { BuyerAuthorizeView } from "../views";
import "../authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "买家授权" };

export default async function BuyerAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; mode?: string }>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const loaded = loadEnv(process.env);
  if (!loaded.ok) {
    throw new Error(loaded.message.trim());
  }
  return (
    <BuyerAuthorizeView
      notice={params.notice ?? null}
      mode={params.mode === "login" ? "login" : "register"}
      captchaPrefix={loaded.env.ALIYUN_CAPTCHA_PREFIX}
      captchaSceneId={loaded.env.ALIYUN_CAPTCHA_SCENE_ID}
    />
  );
}
