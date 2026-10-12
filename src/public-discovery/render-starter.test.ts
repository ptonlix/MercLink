import { describe, expect, it } from "vitest";
import {
  authorizeTemplateNames,
  buyerAuthorizeSubmit,
  merchantAuthorizeSubmit,
  prepareAuthorizeStep,
} from "../domain/storefront/authorize";
import { renderStarterFragments } from "./render-starter";
import { starterDocument } from "./starter-markup";
import { renderDocument, type SlotProduct } from "../domain/storefront/slots";

describe("starter documents", () => {
  it("populates the default product layout without client-only controls", () => {
    const product: SlotProduct = {
      id: "prd_native",
      name: "Food & Culture",
      cover: "https://merclink.example/media/cover",
      fields: { description: "第一段\n\n第二段", custom: "自定义字段" },
      priceMinor: 30800,
      availability: "in_stock",
      stock: null,
      variants: [
        {
          id: "var_native",
          optionValues: {},
          priceMinor: 30800,
          stock: null,
          availability: "in_stock",
        },
      ],
    };
    const html = renderDocument(starterDocument("products/item.html"), {
      store: null,
      products: [],
      product,
      orderStatus: null,
      nextCursor: null,
    });
    expect(html).toContain('name="viewport"');
    expect(html).toContain('class="detailCover"');
    expect(html).toContain('src="https://merclink.example/media/cover"');
    expect(html).toContain("Food &amp; Culture");
    expect(html).not.toContain("Food &amp;amp; Culture");
    expect(html).toContain("¥308.00");
    expect(html).toContain("第一段\n\n第二段");
    expect(html).toContain("自定义字段");
    expect(html).toContain("var_native");
    expect(html).not.toContain("merclink-slot");
    expect(html).not.toContain("复制购买需求");
    expect(html).toContain('href="/skill.md"');
  });
  it("populates homepage panels as working links without client scripts", () => {
    const product: SlotProduct = {
      id: "prd_panel",
      name: "Food & Culture",
      cover: null,
      fields: {},
      priceMinor: 30800,
      availability: "in_stock",
      stock: null,
      variants: [],
    };
    const html = renderDocument(starterDocument("index.html"), {
      store: null,
      products: [product, { ...product, id: "prd_second", name: "Night ride" }],
      product: null,
      orderStatus: null,
      nextCursor: null,
    });
    expect(html.match(/class="deckCard"/g)).toHaveLength(2);
    expect(html).toContain('href="/products/prd_panel"');
    expect(html).toContain('href="/products/prd_second"');
    expect(html).toContain("Food &amp; Culture");
    expect(html).toContain("¥308.00");
    expect(html).not.toContain("merclink-slot");
    expect(html).not.toContain("pause-film");
  });

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
