import type { CaptchaPort, CaptchaVerifyResult } from "../../ports/captcha";

export function createDevCaptcha(): CaptchaPort {
  return {
    verify(input): Promise<CaptchaVerifyResult> {
      if (input.captchaVerifyParam.trim().length === 0) {
        return Promise.resolve({ ok: false, message: "请完成人机验证。" });
      }
      return Promise.resolve({ ok: true });
    },
  };
}
