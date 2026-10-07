import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buyerCaptchaConfig } from "../../app/authorize/buyer-captcha";
import {
  AccountKeyView,
  BuyerAuthorizeView,
  MerchantAuthorizeView,
} from "../../app/authorize/views";
import { unknownMerchantMessage } from "../../domain/identity/accounts";

describe("authorization pages", () => {
  it("has no registration control and tells an unknown phone to contact an administrator", () => {
    const html = renderToStaticMarkup(
      createElement(MerchantAuthorizeView, {
        notice: unknownMerchantMessage,
        mustChangePassword: false,
      }),
    );
    expect(html).toContain(unknownMerchantMessage);
    expect(html).not.toContain("注册");
    expect(html).not.toContain("API Key");
    expect(html).not.toContain("创建密钥");
  });

  it("lets a buyer register and does not offer an API key", () => {
    const html = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        mode: "register",
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(html).toContain("设置密码");
    expect(html).toContain("发送验证码");
    expect(html).toContain("captcha-element");
    expect(html).toContain('name="captchaVerifyParam"');
    expect(html).toContain('data-captcha-prefix="captcha-prefix"');
    expect(html).toContain('data-captcha-region="cn"');
    expect(html).not.toContain("人机验证参数");
    expect(html).not.toContain("API Key");
    expect(html).not.toContain("开通商家");
    expect(buyerCaptchaConfig("captcha-prefix")).toEqual({
      region: "cn",
      prefix: "captcha-prefix",
    });
  });

  it("creates API keys only on the logged-in account page", () => {
    const html = renderToStaticMarkup(createElement(AccountKeyView, { keys: [], secret: null }));
    expect(html).toContain("API Key");
    expect(html).toContain("创建密钥");
  });
});
