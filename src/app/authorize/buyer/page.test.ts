import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetPurchaseModeCache } from "../../../shared/purchase-mode";
import BuyerAuthorizePage from "./page";

afterEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

describe("buyer authorization page", () => {
  it("does not render a phone form or captcha script when purchase is disabled", async () => {
    const html = renderToStaticMarkup(
      await BuyerAuthorizePage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("本部署未开启买入。");
    expect(html).not.toContain("没有注册、登录或图形验证");
    expect(html).not.toContain("o.alicdn.com");
    expect(html).not.toContain("captchaVerifyParam");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="tel"');
  });
});
