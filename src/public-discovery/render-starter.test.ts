import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authorizeTemplateNames,
  buyerAuthorizeSubmit,
  merchantAuthorizeSubmit,
  prepareAuthorizeStep,
} from "../domain/storefront/authorize";
import { resetPurchaseModeCache } from "../shared/purchase-mode";
import { renderStarterFragments } from "./render-starter";
import { parseStarterFragments, starterDocument } from "./starter-markup";

type StarterPageName =
  | "index.html"
  | "products/index.html"
  | "products/item.html"
  | "account/buyer.html"
  | "account/merchant.html"
  | "pay/result.html";

function pageSet(marker: string): Record<StarterPageName, string> {
  const pages = {
    "index.html": `<main>${marker}</main>`,
    "products/index.html": "<main>list</main>",
    "products/item.html": "<main>item</main>",
    "account/buyer.html": "<main>buyer</main>",
    "account/merchant.html": "<main>merchant</main>",
    "pay/result.html": "<main>paid</main>",
  };
  return pages;
}

async function writeBaked(root: string, off: string, on: string): Promise<void> {
  await writeFile(
    path.join(root, "storefront-starter.json"),
    JSON.stringify({ "0": pageSet(off), "1": pageSet(on) }),
  );
}

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

describe("baked starter fragments", () => {
  const previousPurchase = process.env.MERCLINK_PURCHASE;

  afterEach(() => {
    if (previousPurchase === undefined) {
      delete process.env.MERCLINK_PURCHASE;
    } else {
      process.env.MERCLINK_PURCHASE = previousPurchase;
    }
    resetPurchaseModeCache();
  });

  it("requires every non-empty page", () => {
    const baked = parseStarterFragments(
      JSON.stringify({
        "index.html": "<main>home</main>",
        "products/index.html": "<main>list</main>",
        "products/item.html": "<main>item</main>",
        "account/buyer.html": "<main>buyer</main>",
        "account/merchant.html": "<main>merchant</main>",
        "pay/result.html": "<main>paid</main>",
      }),
    );
    expect(baked["index.html"]).toBe("<main>home</main>");
    expect(() => parseStarterFragments(JSON.stringify({ "index.html": "<main></main>" }))).toThrow(
      "starter fragment missing: products/index.html",
    );
  });

  it("selects the baked payload with currentPurchaseEnabled", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "starter-baked-"));
    try {
      await writeBaked(root, "purchase-off", "purchase-on");
      process.env.MERCLINK_PURCHASE = "0";
      resetPurchaseModeCache();
      expect(starterDocument("index.html", root)).toContain("purchase-off");
      expect(starterDocument("index.html", root)).not.toContain("purchase-on");

      process.env.MERCLINK_PURCHASE = "1";
      expect(starterDocument("index.html", root)).toContain("purchase-off");

      resetPurchaseModeCache();
      expect(starterDocument("index.html", root)).toContain("purchase-on");
      expect(starterDocument("index.html", root)).not.toContain("purchase-off");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses a present render script instead of the baked file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "starter-script-"));
    try {
      await writeBaked(root, "from-json", "from-json");
      await mkdir(path.join(root, "scripts"));
      await writeFile(
        path.join(root, "scripts/render-starter.mjs"),
        `process.stdout.write(${JSON.stringify(JSON.stringify(pageSet("from-script")))});\n`,
      );
      resetPurchaseModeCache();
      const document = starterDocument("index.html", root);
      expect(document).toContain("from-script");
      expect(document).not.toContain("from-json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws when either baked payload is missing a page", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "starter-incomplete-"));
    try {
      const on = pageSet("purchase-on");
      on["products/index.html"] = "";
      await writeFile(
        path.join(root, "storefront-starter.json"),
        JSON.stringify({ "0": pageSet("purchase-off"), "1": on }),
      );
      delete process.env.MERCLINK_PURCHASE;
      resetPurchaseModeCache();
      expect(() => starterDocument("index.html", root)).toThrow(
        "starter fragment missing: products/index.html",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
