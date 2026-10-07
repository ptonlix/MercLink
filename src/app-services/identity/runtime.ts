import { createAliyunCaptcha } from "../../adapters/aliyun-captcha/adapter";
import { createAliyunSms } from "../../adapters/aliyun-sms/adapter";
import { createDevCaptcha } from "../../adapters/dev/captcha";
import { createDevSms } from "../../adapters/dev/sms";
import { createRedisRateLimit } from "../../adapters/redis/limiter";
import { getDatabase, type Sql } from "../../db/client";
import { smsRateLimitPolicies } from "../../domain/identity/registration";
import { systemClock, type Clock } from "../../ports/clock";
import type { CaptchaPort } from "../../ports/captcha";
import type { RateLimitPort } from "../../ports/rate-limit";
import type { SmsPort } from "../../ports/sms";
import { devStubsEnabled } from "../../shared/dev-stubs";
import { loadEnv, type AppEnv } from "../../shared/env";

export type AppRuntime = {
  env: AppEnv;
  sql: Sql;
  clock: Clock;
  captcha: CaptchaPort;
  sms: SmsPort;
  rateLimit: RateLimitPort;
};

export function appRuntime(): AppRuntime {
  const loaded = loadEnv(process.env);
  if (!loaded.ok) {
    throw new Error(loaded.message.trim());
  }
  const stubs = devStubsEnabled(process.env);
  return {
    env: loaded.env,
    sql: getDatabase(loaded.env.DATABASE_URL).sql,
    clock: systemClock,
    captcha: stubs
      ? createDevCaptcha()
      : createAliyunCaptcha({
          accessKeyId: loaded.env.ALIYUN_CAPTCHA_ACCESS_KEY_ID,
          accessKeySecret: loaded.env.ALIYUN_CAPTCHA_ACCESS_KEY_SECRET,
          sceneId: loaded.env.ALIYUN_CAPTCHA_SCENE_ID,
        }),
    sms: stubs
      ? createDevSms()
      : createAliyunSms({
          accessKeyId: loaded.env.ALIYUN_SMS_ACCESS_KEY_ID,
          accessKeySecret: loaded.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
          signName: loaded.env.ALIYUN_SMS_SIGN_NAME,
          templateCode: loaded.env.ALIYUN_SMS_TEMPLATE_CODE,
        }),
    rateLimit: createRedisRateLimit({
      url: loaded.env.REDIS_URL,
      policies: smsRateLimitPolicies(),
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
