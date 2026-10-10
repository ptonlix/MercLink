import { describe, expect, it } from "vitest";
import {
  authorizeTemplateNames,
  buyerAuthorizeSubmit,
  merchantAuthorizeSubmit,
  prepareAuthorizeStep,
} from "../domain/storefront/authorize";
import { renderStarterFragments } from "./render-starter";
import { starterDocument } from "./starter-markup";

describe("starter documents", () => {
  it("keeps the downloaded pages on the same templates as the renderer", () => {
    const fragments = renderStarterFragments();
    expect(fragments["index.html"]).toContain("merclink-slot");
    expect(starterDocument("index.html")).toContain(fragments["index.html"]);
    expect(starterDocument("products/index.html")).toContain(fragments["products/index.html"]);
    expect(starterDocument("products/item.html")).toContain(fragments["products/item.html"]);
    expect(starterDocument("account/buyer.html")).toContain('action="/authorize/buyer/submit"');
    expect(starterDocument("account/merchant.html")).toContain(
      'action="/authorize/merchant/submit"',
    );
    expect(starterDocument("pay/result.html")).toContain('name="order.status"');
    expect(starterDocument("pay/result.html")).toContain('data-merclink="order.paid"');
    expect(fragments["pay/result.html"]).toContain('name="order.status"');
    expect(fragments["pay/result.html"]).toContain('data-merclink="order.paid"');
  });

  it("ships every authorization step from the authorize components", () => {
    const fragments = renderStarterFragments();
    const buyer = fragments["account/buyer.html"];
    const merchant = fragments["account/merchant.html"];
    for (const name of [
      authorizeTemplateNames.phone,
      authorizeTemplateNames.code,
      authorizeTemplateNames.password,
      authorizeTemplateNames.approve,
    ]) {
      expect(buyer).toContain(`data-merclink="${name}"`);
    }
    expect(buyer).toContain('<merclink-slot name="authorize.captcha"></merclink-slot>');
    expect(buyer).not.toContain("123456");
    for (const name of [
      authorizeTemplateNames.merchantLogin,
      authorizeTemplateNames.merchantChangePassword,
      authorizeTemplateNames.merchantApprove,
    ]) {
      expect(merchant).toContain(`data-merclink="${name}"`);
    }

    const phone = prepareAuthorizeStep(buyer, {
      templateName: authorizeTemplateNames.phone,
      submitAction: buyerAuthorizeSubmit,
      notice: null,
      phone: "",
      mode: "register",
      accountName: "",
      accountPhone: "",
      pendingApproval: false,
      bindPhone: false,
      clearPhoneValue: true,
      intent: "sms",
      requireCaptchaSlot: true,
      devStubs: false,
      captchaToken: "",
    });
    expect(phone?.injectCaptcha).toBe(true);
    expect(phone?.html).toContain('action="/authorize/buyer/submit"');
    expect(phone?.html).toContain('id="merclink-authorize-captcha"');

    const password = prepareAuthorizeStep(buyer, {
      templateName: authorizeTemplateNames.password,
      submitAction: buyerAuthorizeSubmit,
      notice: null,
      phone: "13800138000",
      mode: "login",
      accountName: "",
      accountPhone: "",
      pendingApproval: false,
      bindPhone: true,
      clearPhoneValue: false,
      intent: "password",
      requireCaptchaSlot: false,
      devStubs: false,
      captchaToken: "",
    });
    expect(password?.html).toContain('value="password"');
    expect(password?.html).toContain("13800138000");
    expect(password?.html).not.toContain("设置密码并登录");

    const merchantLogin = prepareAuthorizeStep(merchant, {
      templateName: authorizeTemplateNames.merchantLogin,
      submitAction: merchantAuthorizeSubmit,
      notice: "请联系管理员开通",
      phone: "",
      mode: "login",
      accountName: "",
      accountPhone: "",
      pendingApproval: false,
      bindPhone: false,
      clearPhoneValue: false,
      intent: "login",
      requireCaptchaSlot: false,
      devStubs: false,
      captchaToken: "",
    });
    expect(merchantLogin?.html).toContain('action="/authorize/merchant/submit"');
    expect(merchantLogin?.html).toContain("请联系管理员开通");
    expect(merchantLogin?.html).not.toContain("注册商家");
  });
});
