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
  it("has no registration control and tells an unknown phone to use the store owner phone", () => {
    const html = renderToStaticMarkup(
      createElement(MerchantAuthorizeView, {
        notice: unknownMerchantMessage,
        mustChangePassword: false,
      }),
    );
    expect(html).toContain(unknownMerchantMessage);
    expect(html).toContain('role="alert"');
    expect(html).toContain("登录");
    expect(html).toContain('name="phone"');
    expect(html).not.toContain('value="approve"');
    expect(html).not.toContain("修改密码");
    expect(html).not.toContain("注册");
    expect(html).not.toContain("API Key");
    expect(html).not.toContain("创建密钥");
  });

  it("shows the logged-in merchant and keeps password change behind the flag", () => {
    const loggedIn = renderToStaticMarkup(
      createElement(MerchantAuthorizeView, {
        notice: null,
        mustChangePassword: false,
        account: { name: "南风铺", phone: "13700137000" },
      }),
    );
    expect(loggedIn).toContain("当前登录 南风铺 13700137000");
    expect(loggedIn).toContain('value="approve"');
    expect(loggedIn).not.toContain('name="phone"');
    expect(loggedIn).not.toContain("修改密码");

    const mustChange = renderToStaticMarkup(
      createElement(MerchantAuthorizeView, {
        notice: null,
        mustChangePassword: true,
        account: { name: "南风铺", phone: "13700137000" },
      }),
    );
    expect(mustChange).toContain("修改密码");
    expect(mustChange).not.toContain('value="approve"');
    expect(mustChange).toContain("先修改初始密码");
    expect(mustChange).not.toContain('name="phone"');
  });

  it("lets a buyer start login and does not offer an API key", () => {
    const html = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        step: "phone",
        mode: "register",
        phone: "",
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(html).toContain("首次登录即注册");
    expect(html).toContain("发送验证码");
    expect(html).toContain("captcha-element");
    expect(html).toMatch(/id="captcha-send"[^>]*disabled/);
    expect(html).toContain('name="captchaVerifyParam"');
    expect(html).toContain('data-captcha-prefix="captcha-prefix"');
    expect(html).toContain('data-captcha-region="cn"');
    expect(html).not.toContain('value="check"');
    expect(html).not.toContain("批准");
    expect(html).not.toContain("人机验证参数");
    expect(html).not.toContain("API Key");
    expect(html).not.toContain("开通商家");
    expect(buyerCaptchaConfig("captcha-prefix")).toEqual({
      region: "cn",
      prefix: "captcha-prefix",
    });
  });

  it("keeps the phone and shows only the current verification step", () => {
    const code = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        step: "code",
        mode: "register",
        phone: "13800138000",
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(code).toContain("13800138000");
    expect(code).toContain("核验短信");
    expect(code).toContain('type="hidden" name="phone"');
    expect(code).not.toContain('value="sms"');
    expect(code).not.toContain("批准");

    const password = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        step: "password",
        mode: "register",
        phone: "13800138000",
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(password).toContain("设置密码并登录");
    expect(password).toContain("首次登录会为 13800138000 创建账号");
    expect(password).not.toContain('name="phone" inputmode="numeric"');
  });

  it("shows the logged-in buyer phone and only submits approval when an interaction is pending", () => {
    const pending = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        step: "approve",
        mode: "login",
        phone: "13800138000",
        pendingApproval: true,
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(pending).toContain("当前登录 13800138000");
    expect(pending).toContain('value="approve"');
    expect(pending).toContain('value="logout"');
    expect(pending).toContain("退出登录");
    expect(pending).not.toContain("发送验证码");
    expect(pending).not.toContain('name="phone"');

    const idle = renderToStaticMarkup(
      createElement(BuyerAuthorizeView, {
        notice: null,
        step: "approve",
        mode: "login",
        phone: "13900139000",
        pendingApproval: false,
        captchaPrefix: "captcha-prefix",
        captchaSceneId: "scene-id",
      }),
    );
    expect(idle).toContain("当前登录 13900139000");
    expect(idle).toContain("当前没有待批准的授权请求");
    expect(idle).toContain('value="logout"');
    expect(idle).not.toContain('value="approve"');
    expect(idle).not.toContain("发送验证码");
  });

  it("creates API keys only on the logged-in account page", () => {
    const html = renderToStaticMarkup(createElement(AccountKeyView, { keys: [], secret: null }));
    expect(html).toContain("API Key");
    expect(html).toContain("创建密钥");
  });
});
