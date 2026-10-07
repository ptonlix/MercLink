import CaptchaClient, { VerifyIntelligentCaptchaRequest } from "@alicloud/captcha20230305";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import type { CaptchaPort, CaptchaVerifyResult } from "../../ports/captcha";

export type AliyunCaptchaConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  sceneId: string;
};

type CaptchaVerifyRequest = {
  captchaVerifyParam: string;
  sceneId: string;
};

export type CaptchaSdk = {
  verifyIntelligentCaptcha(request: CaptchaVerifyRequest): Promise<{
    body?: { result?: { verifyResult?: boolean | string } };
  }>;
};

export function createAliyunCaptcha(
  config: AliyunCaptchaConfig,
  client: CaptchaSdk = createCaptchaSdk(config),
): CaptchaPort {
  return {
    async verify(input): Promise<CaptchaVerifyResult> {
      const response = await client.verifyIntelligentCaptcha({
        captchaVerifyParam: input.captchaVerifyParam,
        sceneId: config.sceneId,
      });
      const result = response.body?.result?.verifyResult;
      if (result === true || result === "PASS") {
        return { ok: true };
      }
      return { ok: false, message: "人机验证未通过。" };
    },
  };
}

export function createCaptchaSdk(config: AliyunCaptchaConfig): CaptchaSdk {
  const sdk = new CaptchaClient(
    new $OpenApiUtil.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: "captcha.cn-shanghai.aliyuncs.com",
    }),
  );
  return {
    verifyIntelligentCaptcha: (request) =>
      sdk.verifyIntelligentCaptcha(new VerifyIntelligentCaptchaRequest(request)),
  };
}
