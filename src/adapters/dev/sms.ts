import type { SmsPort, SmsResult } from "../../ports/sms";
import { devSmsCode } from "../../shared/dev-stubs";

export function createDevSms(): SmsPort {
  return {
    sendCode(): Promise<SmsResult> {
      return Promise.resolve({ ok: true });
    },
    checkCode(input): Promise<SmsResult> {
      if (input.code.trim() !== devSmsCode) {
        return Promise.resolve({ ok: false, message: "验证码不正确。" });
      }
      return Promise.resolve({ ok: true });
    },
  };
}
