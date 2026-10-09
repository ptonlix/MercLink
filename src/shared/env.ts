import { z } from "zod";
import {
  devStubsBlocked,
  devStubsEnabled,
  devUnusedCredential,
  vendorCredentials,
} from "./dev-stubs";

const nonEmpty = z.string().trim().min(1);

export const envSchema = z.object({
  DATABASE_URL: nonEmpty,
  ADMIN_PHONE: nonEmpty,
  ADMIN_PASSWORD: nonEmpty,
  OAUTH_SIGNING_SECRET: nonEmpty,
  ALIYUN_CAPTCHA_ACCESS_KEY_ID: nonEmpty,
  ALIYUN_CAPTCHA_ACCESS_KEY_SECRET: nonEmpty,
  ALIYUN_CAPTCHA_SCENE_ID: nonEmpty,
  ALIYUN_CAPTCHA_PREFIX: nonEmpty,
  ALIYUN_SMS_ACCESS_KEY_ID: nonEmpty,
  ALIYUN_SMS_ACCESS_KEY_SECRET: nonEmpty,
  ALIYUN_SMS_SIGN_NAME: nonEmpty,
  ALIYUN_SMS_TEMPLATE_CODE: nonEmpty,
  ALIPAY_APP_ID: nonEmpty,
  ALIPAY_PRIVATE_KEY: nonEmpty,
  ALIPAY_PUBLIC_KEY: nonEmpty,
  ALIPAY_NOTIFY_URL: nonEmpty,
  APP_BASE_URL: nonEmpty,
  REDIS_URL: nonEmpty,
  OBJECT_STORAGE_ENDPOINT: nonEmpty,
  OBJECT_STORAGE_REGION: nonEmpty,
  OBJECT_STORAGE_BUCKET: nonEmpty,
  OBJECT_STORAGE_ACCESS_KEY_ID: nonEmpty,
  OBJECT_STORAGE_SECRET_ACCESS_KEY: nonEmpty,
});

export const requiredEnvKeys = [
  "DATABASE_URL",
  "ADMIN_PHONE",
  "ADMIN_PASSWORD",
  "OAUTH_SIGNING_SECRET",
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
  "APP_BASE_URL",
  "REDIS_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
] as const satisfies readonly (keyof z.infer<typeof envSchema>)[];

export type EnvKey = (typeof requiredEnvKeys)[number];

export type AppEnv = z.infer<typeof envSchema>;

export type LoadEnvResult =
  { ok: true; env: AppEnv } | { ok: false; missing: readonly EnvKey[]; message: string };

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

export function loadEnv(source: Readonly<Record<string, string | undefined>>): LoadEnvResult {
  if (devStubsBlocked(source)) {
    return {
      ok: false,
      missing: [],
      message: "MERCLINK_DEV_STUBS cannot be enabled when NODE_ENV=production\n",
    };
  }
  const skipped = devStubsEnabled(source)
    ? new Set<string>(vendorCredentials())
    : new Set<string>();
  if (source.MERCLINK_PAYMENT_PROVIDER === "easypay") {
    for (const key of [
      "ALIPAY_APP_ID",
      "ALIPAY_PRIVATE_KEY",
      "ALIPAY_PUBLIC_KEY",
      "ALIPAY_NOTIFY_URL",
    ] as const) {
      skipped.add(key);
    }
  }
  const missing = requiredEnvKeys.filter((key) => !skipped.has(key) && !isPresent(source[key]));
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: `Missing required environment: ${missing.join(", ")}\n`,
    };
  }

  const candidate: Record<string, string> = {};
  for (const key of requiredEnvKeys) {
    const value = source[key];
    if (isPresent(value)) {
      candidate[key] = value;
      continue;
    }
    if (skipped.has(key)) {
      candidate[key] = devUnusedCredential;
      continue;
    }
    return {
      ok: false,
      missing: [key],
      message: `Missing required environment: ${key}\n`,
    };
  }

  const parsed = envSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      missing: requiredEnvKeys.filter((key) => !isPresent(candidate[key])),
      message: `Missing required environment: ${missing.join(", ")}\n`,
    };
  }

  return { ok: true, env: parsed.data };
}

export function secretValues(env: AppEnv): readonly string[] {
  const values: string[] = Object.values(env);
  pushUrlPassword(values, env.DATABASE_URL);
  pushUrlPassword(values, env.REDIS_URL);
  return values.filter((value) => value.length > 0);
}

function pushUrlPassword(values: string[], url: string): void {
  try {
    const password = new URL(url).password;
    if (password !== "") {
      values.push(decodeURIComponent(password));
    }
  } catch {
    // The full URL is already included.
  }
}
