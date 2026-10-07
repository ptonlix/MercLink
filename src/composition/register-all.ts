import type Provider from "oidc-provider";
import { registerAccessAuthenticator } from "../app-services/access/authenticate";
import { parseAccountId } from "../app-services/access/grants";
import { authorizationIssuer, createAccessProvider } from "../app-services/access/provider";
import { listMerchantCatalogIds } from "../app-services/catalog/catalogs";
import { registerCatalog } from "../app-services/catalog/register";
import { registerCatalogOwnership } from "../app-services/commerce/runtime";
import { getDatabase, type Sql } from "../db/client";
import { ensureSuperAdmin } from "../app-services/identity/admin";
import { accountCanAuthenticate } from "../app-services/identity/can-authenticate";
import { appRuntime } from "../app-services/identity/runtime";
import { getRedisClient } from "../adapters/redis/client";
import { createRedisRateLimit } from "../adapters/redis/limiter";
import { systemClock } from "../ports/clock";
import { imageUploadPolicies } from "../ports/rate-limit";
import { createObjectStorageClient, createS3ObjectStorage } from "../adapters/s3";
import { bindMediaRuntime } from "../app-services/catalog/media-runtime";
import { assertRuntimeDependencies } from "./runtime-deps";
import { loadEnv, secretValues, type AppEnv } from "../shared/env";
import { redactText } from "../shared/log";

let ready = false;
let expiryTimer: ReturnType<typeof setInterval> | undefined;

export function isCompositionReady(): boolean {
  return ready;
}

export function registerSlices(input: { sql: Sql; provider: Provider }): void {
  registerAccessAuthenticator(input.sql, input.provider);
  registerCatalog(input.sql);
  registerCatalogOwnership((merchantId) => listMerchantCatalogIds(input.sql, merchantId));
}

export async function registerAll(source: NodeJS.ProcessEnv = process.env): Promise<void> {
  ready = false;
  const loaded = loadEnv(source);
  if (!loaded.ok) {
    throw new Error(loaded.message.trim());
  }
  await bindObjectStorage(loaded.env);
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: loaded.env.ADMIN_PHONE,
    password: loaded.env.ADMIN_PASSWORD,
  });
  const provider = await createAccessProvider({
    issuer: authorizationIssuer(loaded.env.APP_BASE_URL),
    cookieSecret: loaded.env.OAUTH_SIGNING_SECRET,
    sql: runtime.sql,
    accounts: {
      isActive: (accountId) => accountIsActive(runtime.sql, accountId),
    },
  });
  registerSlices({ sql: getDatabase(loaded.env.DATABASE_URL).sql, provider });
  ready = true;
}

export function scheduleExpiryScan(): void {
  if (expiryTimer !== undefined) {
    return;
  }
  expiryTimer = setInterval(() => {
    void import("../jobs/close-expired-orders")
      .then((job) => job.runOnce())
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "expiry scan failed";
        process.stderr.write(`${message}\n`);
      });
  }, 60_000);
  expiryTimer.unref();
}

export async function runCompositionSteps(
  steps: readonly (() => Promise<void> | void)[],
): Promise<void> {
  ready = false;
  for (const step of steps) {
    await step();
  }
  ready = true;
}

async function bindObjectStorage(env: AppEnv): Promise<void> {
  const redis = await getRedisClient(env.REDIS_URL);
  const s3 = createObjectStorageClient({
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    region: env.OBJECT_STORAGE_REGION,
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  });
  const objectStorage = createS3ObjectStorage({
    client: { send: (command) => s3.send(command as never) },
    bucket: env.OBJECT_STORAGE_BUCKET,
  });
  try {
    await assertRuntimeDependencies({ redis, objectStorage });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "runtime dependency failed";
    throw new Error(redactText(raw, secretValues(env)));
  }
  bindMediaRuntime({
    rateLimit: createRedisRateLimit({
      url: env.REDIS_URL,
      policies: imageUploadPolicies,
      client: redis,
    }),
    objectStorage,
    mediaBaseUrl: env.APP_BASE_URL,
    clock: systemClock,
  });
}

async function accountIsActive(sql: Sql, accountId: string): Promise<boolean> {
  const parsed = parseAccountId(accountId);
  if (parsed === null) {
    return false;
  }
  return accountCanAuthenticate(sql, parsed);
}
