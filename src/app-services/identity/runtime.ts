import { createAliyunCaptcha } from "../../adapters/aliyun-captcha/adapter";
import { createAliyunSms } from "../../adapters/aliyun-sms/adapter";
import { getDatabase, type Sql } from "../../db/client";
import { systemClock, type Clock } from "../../ports/clock";
import type { CaptchaPort } from "../../ports/captcha";
import type { SmsPort } from "../../ports/sms";
import { loadEnv, type AppEnv } from "../../shared/env";

export type AppRuntime = {
  env: AppEnv;
  sql: Sql;
  clock: Clock;
  captcha: CaptchaPort;
  sms: SmsPort;
};

export function appRuntime(): AppRuntime {
  const loaded = loadEnv(process.env);
  if (!loaded.ok) {
    throw new Error(loaded.message.trim());
  }
  return {
    env: loaded.env,
    sql: getDatabase(loaded.env.DATABASE_URL).sql,
    clock: systemClock,
    captcha: createAliyunCaptcha({
      accessKeyId: loaded.env.ALIYUN_CAPTCHA_ACCESS_KEY_ID,
      accessKeySecret: loaded.env.ALIYUN_CAPTCHA_ACCESS_KEY_SECRET,
      sceneId: loaded.env.ALIYUN_CAPTCHA_SCENE_ID,
    }),
    sms: createAliyunSms({
      accessKeyId: loaded.env.ALIYUN_SMS_ACCESS_KEY_ID,
      accessKeySecret: loaded.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
      signName: loaded.env.ALIYUN_SMS_SIGN_NAME,
      templateCode: loaded.env.ALIYUN_SMS_TEMPLATE_CODE,
    }),
  };
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function redirectTo(
  path: string,
  cookie?: { name: string; value: string; path: string },
): Response {
  const headers = new Headers({ location: path });
  if (cookie !== undefined) {
    headers.append(
      "set-cookie",
      `${cookie.name}=${encodeURIComponent(cookie.value)}; Path=${cookie.path}; HttpOnly; SameSite=Lax`,
    );
  }
  return new Response(null, { status: 303, headers });
}
