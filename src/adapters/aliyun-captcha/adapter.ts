import { createHash, createHmac, randomUUID } from "node:crypto";
import type { CaptchaPort, CaptchaVerifyResult } from "../../ports/captcha";

export type AliyunCaptchaConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  sceneId: string;
};

const endpoint = "https://captcha.cn-shanghai.aliyuncs.com/";

export function createAliyunCaptcha(
  config: AliyunCaptchaConfig,
  fetchImpl: typeof fetch = fetch,
): CaptchaPort {
  return {
    async verify(input): Promise<CaptchaVerifyResult> {
      const body = JSON.stringify({
        CaptchaVerifyParam: input.captchaVerifyParam,
        SceneId: config.sceneId,
      });
      const response = await signedPost(fetchImpl, {
        url: endpoint,
        action: "VerifyIntelligentCaptcha",
        version: "2023-03-05",
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        body,
      });
      if (!response.ok) {
        return { ok: false, message: "人机验证未通过。" };
      }
      const payload = await readJson(response);
      const result = nested(payload, "Result");
      const verifyResult = result?.VerifyResult;
      if (verifyResult === true || verifyResult === "PASS") {
        return { ok: true };
      }
      return { ok: false, message: "人机验证未通过。" };
    },
  };
}

export async function signedPost(
  fetchImpl: typeof fetch,
  input: {
    url: string;
    action: string;
    version: string;
    accessKeyId: string;
    accessKeySecret: string;
    body: string;
  },
): Promise<Response> {
  const url = new URL(input.url);
  const hashedPayload = sha256(input.body);
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const headers: Record<string, string> = {
    host: url.host,
    "content-type": "application/json",
    "x-acs-action": input.action,
    "x-acs-version": input.version,
    "x-acs-date": date,
    "x-acs-signature-nonce": randomUUID(),
    "x-acs-content-sha256": hashedPayload,
  };
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name] ?? ""}\n`).join("");
  const canonical = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders.join(";"),
    hashedPayload,
  ].join("\n");
  const stringToSign = `ACS3-HMAC-SHA256\n${sha256(canonical)}`;
  const signature = createHmac("sha256", input.accessKeySecret).update(stringToSign).digest("hex");
  headers.authorization = `ACS3-HMAC-SHA256 Credential=${input.accessKeyId},SignedHeaders=${signedHeaders.join(";")},Signature=${signature}`;
  return fetchImpl(url, { method: "POST", headers, body: input.body });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function nested(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key];
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
