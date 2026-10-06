import type { CaptchaPort } from "../../ports/captcha";
import type { SmsPort } from "../../ports/sms";

export function fakeCaptcha(accept: (param: string) => boolean): CaptchaPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    verify: (input) => {
      calls.push(input.captchaVerifyParam);
      return Promise.resolve(
        accept(input.captchaVerifyParam)
          ? { ok: true }
          : { ok: false, message: "人机验证未通过。" },
      );
    },
  };
}

export function fakeSms(): SmsPort & {
  sendCalls: string[];
  checkCalls: string[];
  acceptCode: string;
} {
  const sendCalls: string[] = [];
  const checkCalls: string[] = [];
  const acceptCode = "246810";
  return {
    sendCalls,
    checkCalls,
    acceptCode,
    sendCode: (input) => {
      sendCalls.push(input.phone);
      return Promise.resolve({ ok: true });
    },
    checkCode: (input) => {
      checkCalls.push(`${input.phone}:${input.code}`);
      return Promise.resolve(
        input.code === acceptCode ? { ok: true } : { ok: false, message: "验证码不正确。" },
      );
    },
  };
}
