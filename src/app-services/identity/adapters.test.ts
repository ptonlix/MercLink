import { describe, expect, it } from "vitest";
import { createAliyunCaptcha } from "../../adapters/aliyun-captcha/adapter";
import { createAliyunSms } from "../../adapters/aliyun-sms/adapter";

describe("aliyun adapters", () => {
  it("calls captcha verification and does not put the secret in the request", async () => {
    const calls: { url: string; action: string | null; authorization: string | null }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
        action: headers.get("x-acs-action"),
        authorization: headers.get("authorization"),
      });
      return Promise.resolve(Response.json({ Success: true, Result: { VerifyResult: true } }));
    };
    const captcha = createAliyunCaptcha(
      { accessKeyId: "captcha-key", accessKeySecret: "captcha-secret", sceneId: "scene" },
      fetchImpl,
    );
    await expect(captcha.verify({ captchaVerifyParam: "param" })).resolves.toEqual({ ok: true });
    expect(calls[0]?.url).toContain("captcha.cn-shanghai.aliyuncs.com");
    expect(calls[0]?.action).toBe("VerifyIntelligentCaptcha");
    expect(calls[0]?.authorization).toContain("captcha-key");
    expect(calls[0]?.authorization).not.toContain("captcha-secret");
    expect(calls[0]?.url).not.toContain("captcha-secret");
  });

  it("sends and checks SMS through the number-authentication actions", async () => {
    const actions: string[] = [];
    const fetchImpl: typeof fetch = (_input, init) => {
      actions.push(new Headers(init?.headers).get("x-acs-action") ?? "");
      return Promise.resolve(
        Response.json({ Success: true, Code: "OK", Model: { VerifyResult: "PASS" } }),
      );
    };
    const sms = createAliyunSms(
      {
        accessKeyId: "sms-key",
        accessKeySecret: "sms-secret",
        signName: "签名",
        templateCode: "SMS_1",
      },
      fetchImpl,
    );
    await expect(sms.sendCode({ phone: "13800138000" })).resolves.toEqual({ ok: true });
    await expect(sms.checkCode({ phone: "13800138000", code: "123456" })).resolves.toEqual({
      ok: true,
    });
    expect(actions).toEqual(["SendSmsVerifyCode", "CheckSmsVerifyCode"]);
  });
});
