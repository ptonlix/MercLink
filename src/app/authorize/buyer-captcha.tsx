"use client";

import { useEffect, type ReactNode } from "react";

const captchaScript = "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";

export type BuyerCaptchaConfig = {
  region: "cn";
  prefix: string;
};

export function buyerCaptchaConfig(prefix: string): BuyerCaptchaConfig {
  return { region: "cn", prefix };
}

type CaptchaWindow = Window & {
  AliyunCaptchaConfig?: BuyerCaptchaConfig;
  initAliyunCaptcha?: (options: {
    SceneId: string;
    mode: "embed";
    element: string;
    button: string;
    success: (captchaVerifyParam: string) => void;
    fail: (result: unknown) => void;
    language: "cn";
    slideStyle: { width: number; height: number };
  }) => void;
};

export function BuyerCaptcha(props: { prefix: string; sceneId: string }): ReactNode {
  useEffect(() => {
    const target = window as CaptchaWindow;
    target.AliyunCaptchaConfig = buyerCaptchaConfig(props.prefix);
    let cancelled = false;

    function init(): void {
      if (cancelled || target.initAliyunCaptcha === undefined) {
        return;
      }
      target.initAliyunCaptcha({
        SceneId: props.sceneId,
        mode: "embed",
        element: "#captcha-element",
        button: "#captcha-send",
        language: "cn",
        slideStyle: { width: 360, height: 40 },
        success: (captchaVerifyParam) => {
          const field = document.querySelector<HTMLInputElement>("#captchaVerifyParam");
          const button = document.querySelector<HTMLButtonElement>("#captcha-send");
          if (field !== null) {
            field.value = captchaVerifyParam;
          }
          if (button !== null) {
            button.disabled = false;
          }
        },
        fail: () => {
          const field = document.querySelector<HTMLInputElement>("#captchaVerifyParam");
          const button = document.querySelector<HTMLButtonElement>("#captcha-send");
          if (field !== null) {
            field.value = "";
          }
          if (button !== null) {
            button.disabled = true;
          }
        },
      });
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-aliyun-captcha]");
    if (existing !== null) {
      if (target.initAliyunCaptcha === undefined) {
        existing.addEventListener("load", init, { once: true });
      } else {
        init();
      }
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = captchaScript;
    script.async = true;
    script.dataset.aliyunCaptcha = "true";
    script.addEventListener("load", init, { once: true });
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [props.prefix, props.sceneId]);

  return (
    <div className="captcha" data-captcha-region="cn" data-captcha-prefix={props.prefix}>
      <div id="captcha-element" />
      <input id="captchaVerifyParam" type="hidden" name="captchaVerifyParam" defaultValue="" />
    </div>
  );
}
