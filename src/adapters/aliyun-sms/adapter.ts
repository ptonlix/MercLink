import DypnsClient, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from "@alicloud/dypnsapi20170525";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import type { SmsPort, SmsResult } from "../../ports/sms";

export type AliyunSmsConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
};

type SmsSendRequest = {
  phoneNumber: string;
  signName: string;
  templateCode: string;
  countryCode: string;
  codeLength: number;
  validTime: number;
  interval: number;
  codeType: number;
};

type SmsCheckRequest = {
  phoneNumber: string;
  verifyCode: string;
  countryCode: string;
};

type SmsResponse = {
  body?: {
    success?: boolean;
    code?: string;
    model?: { verifyResult?: string };
  };
};

export type SmsSdk = {
  sendSmsVerifyCode(request: SmsSendRequest): Promise<SmsResponse>;
  checkSmsVerifyCode(request: SmsCheckRequest): Promise<SmsResponse>;
};

export function createAliyunSms(
  config: AliyunSmsConfig,
  client: SmsSdk = createSmsSdk(config),
): SmsPort {
  return {
    async sendCode(input): Promise<SmsResult> {
      const response = await client.sendSmsVerifyCode({
        phoneNumber: input.phone,
        signName: config.signName,
        templateCode: config.templateCode,
        countryCode: "86",
        codeLength: 6,
        validTime: 300,
        interval: 60,
        codeType: 1,
      });
      return mapResult(response);
    },
    async checkCode(input): Promise<SmsResult> {
      const response = await client.checkSmsVerifyCode({
        phoneNumber: input.phone,
        verifyCode: input.code,
        countryCode: "86",
      });
      return mapResult(response, true);
    },
  };
}

export function createSmsSdk(config: AliyunSmsConfig): SmsSdk {
  const sdk = new DypnsClient(
    new $OpenApiUtil.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: "dypnsapi.aliyuncs.com",
    }),
  );
  return {
    sendSmsVerifyCode: (request) =>
      sdk.sendSmsVerifyCode(new SendSmsVerifyCodeRequest(request)) as Promise<SmsResponse>,
    checkSmsVerifyCode: (request) => sdk.checkSmsVerifyCode(new CheckSmsVerifyCodeRequest(request)),
  };
}

function mapResult(response: SmsResponse, check = false): SmsResult {
  const body = response.body;
  const verifyResult = body?.model?.verifyResult;
  if (check && verifyResult !== "PASS") {
    return { ok: false, message: "验证码不正确。" };
  }
  if (body?.success === false || body?.code === "isv.BUSINESS_LIMIT_CONTROL") {
    return { ok: false, message: "短信发送失败。" };
  }
  if (body?.code !== undefined && body.code !== "OK" && body.success !== true) {
    return { ok: false, message: "短信服务暂不可用。" };
  }
  return { ok: true };
}
