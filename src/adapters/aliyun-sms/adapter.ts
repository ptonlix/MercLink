import type { SmsPort, SmsResult } from "../../ports/sms";
import { signedPost } from "../aliyun-captcha/adapter";

export type AliyunSmsConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
};

const endpoint = "https://dypnsapi.aliyuncs.com/";

export function createAliyunSms(config: AliyunSmsConfig, fetchImpl: typeof fetch = fetch): SmsPort {
  return {
    async sendCode(input): Promise<SmsResult> {
      const response = await signedPost(fetchImpl, {
        url: endpoint,
        action: "SendSmsVerifyCode",
        version: "2017-05-25",
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        body: JSON.stringify({
          PhoneNumber: input.phone,
          SignName: config.signName,
          TemplateCode: config.templateCode,
          CountryCode: "86",
          CodeLength: 6,
          ValidTime: 300,
          Interval: 60,
          CodeType: 1,
        }),
      });
      return mapResult(response);
    },
    async checkCode(input): Promise<SmsResult> {
      const response = await signedPost(fetchImpl, {
        url: endpoint,
        action: "CheckSmsVerifyCode",
        version: "2017-05-25",
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        body: JSON.stringify({
          PhoneNumber: input.phone,
          VerifyCode: input.code,
          CountryCode: "86",
        }),
      });
      return mapResult(response, true);
    },
  };
}

async function mapResult(response: Response, check = false): Promise<SmsResult> {
  if (!response.ok) {
    return { ok: false, message: "短信服务暂不可用。" };
  }
  const parsed: unknown = await response.json();
  const payload =
    parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const model = payload.Model;
  const modelRecord =
    model !== null && typeof model === "object" ? (model as Record<string, unknown>) : null;
  const verifyResult = modelRecord?.VerifyResult;
  if (check && verifyResult !== "PASS" && verifyResult !== true) {
    return { ok: false, message: "验证码不正确。" };
  }
  if (payload.Success === false || payload.Code === "isv.BUSINESS_LIMIT_CONTROL") {
    return { ok: false, message: "短信发送失败。" };
  }
  return { ok: true };
}
