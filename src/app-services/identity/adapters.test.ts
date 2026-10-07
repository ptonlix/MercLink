import { describe, expect, it } from "vitest";
import {
  createAliyunCaptcha,
  createCaptchaSdk,
  type CaptchaSdk,
} from "../../adapters/aliyun-captcha/adapter";
import { createAliyunSms, createSmsSdk, type SmsSdk } from "../../adapters/aliyun-sms/adapter";

describe("aliyun adapters", () => {
  it("asks the official captcha SDK to verify and does not send the secret", async () => {
    const calls: { captchaVerifyParam: string; sceneId: string }[] = [];
    const client: CaptchaSdk = {
      verifyIntelligentCaptcha: (request) => {
        calls.push(request);
        expect(JSON.stringify(request)).not.toContain("captcha-secret");
        return Promise.resolve({ body: { result: { verifyResult: true } } });
      },
    };
    const captcha = createAliyunCaptcha(
      { accessKeyId: "captcha-key", accessKeySecret: "captcha-secret", sceneId: "scene" },
      client,
    );
    await expect(captcha.verify({ captchaVerifyParam: "param" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{ captchaVerifyParam: "param", sceneId: "scene" }]);
    expect(createCaptchaSdk).toBeTypeOf("function");
  });

  it("sends and checks SMS through the official number-authentication SDK", async () => {
    const actions: string[] = [];
    const client: SmsSdk = {
      sendSmsVerifyCode: (request) => {
        actions.push("SendSmsVerifyCode");
        expect(request.signName).toBe("签名");
        expect(JSON.stringify(request)).not.toContain("sms-secret");
        return Promise.resolve({ body: { success: true, code: "OK" } });
      },
      checkSmsVerifyCode: () => {
        actions.push("CheckSmsVerifyCode");
        return Promise.resolve({
          body: { success: true, code: "OK", model: { verifyResult: "PASS" } },
        });
      },
    };
    const sms = createAliyunSms(
      {
        accessKeyId: "sms-key",
        accessKeySecret: "sms-secret",
        signName: "签名",
        templateCode: "SMS_1",
      },
      client,
    );
    await expect(sms.sendCode({ phone: "13800138000" })).resolves.toEqual({ ok: true });
    await expect(sms.checkCode({ phone: "13800138000", code: "123456" })).resolves.toEqual({
      ok: true,
    });
    expect(actions).toEqual(["SendSmsVerifyCode", "CheckSmsVerifyCode"]);
    expect(createSmsSdk).toBeTypeOf("function");
  });
});
