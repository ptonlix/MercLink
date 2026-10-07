import { createHmac, timingSafeEqual } from "node:crypto";

export const devStubFlag = "MERCLINK_DEV_STUBS";
export const devSmsCode = "123456";
export const devUnusedCredential = "dev-unused";

const vendorEnvKeys = [
  "ALIYUN_CAPTCHA_ACCESS_KEY_ID",
  "ALIYUN_CAPTCHA_ACCESS_KEY_SECRET",
  "ALIYUN_CAPTCHA_SCENE_ID",
  "ALIYUN_CAPTCHA_PREFIX",
  "ALIYUN_SMS_ACCESS_KEY_ID",
  "ALIYUN_SMS_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "ALIPAY_NOTIFY_URL",
] as const;

export type VendorEnvKey = (typeof vendorEnvKeys)[number];

export function vendorCredentials(): readonly VendorEnvKey[] {
  return vendorEnvKeys;
}

function devStubsRequested(source: Readonly<Record<string, string | undefined>>): boolean {
  return source[devStubFlag] === "1";
}

export function devStubsEnabled(source: Readonly<Record<string, string | undefined>>): boolean {
  return devStubsRequested(source) && source.NODE_ENV === "development";
}

export function devStubsBlocked(source: Readonly<Record<string, string | undefined>>): boolean {
  return devStubsRequested(source) && source.NODE_ENV === "production";
}

export function devPaymentToken(secret: string, paymentId: string, status: string): string {
  return createHmac("sha256", secret).update(`${paymentId}.${status}`).digest("base64url");
}

export function devPaymentTokenMatches(
  secret: string,
  paymentId: string,
  status: string,
  token: string,
): boolean {
  const expected = devPaymentToken(secret, paymentId, status);
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
