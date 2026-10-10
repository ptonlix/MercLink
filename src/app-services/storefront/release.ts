import { createPublicId } from "../../shared/id";
import {
  isFallbackValue,
  isSecretFile,
  publicPathFor,
  validateArchiveBytes,
  validateStaticEntries,
} from "../../domain/storefront/archive";
import { isReservedPath, productItemFile, productListFile } from "../../domain/storefront/paths";
import {
  activationConfirmed,
  pointerAfterActivate,
  pointerAfterRollback,
} from "../../domain/storefront/pointer";
import {
  storefrontFail,
  storefrontOk,
  type StorefrontResult,
} from "../../domain/storefront/result";
import { inspectDocument } from "../../domain/storefront/slots";
import { storefrontUploadPolicyName } from "../../domain/storefront/limits";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";
import { packShippedSource } from "./source";
import { storefrontRuntime } from "./runtime";
import type { FileRow, ReleaseRow } from "./store";
import { unzip } from "./zip";

export type StoredRelease = {
  id: string;
  active: false;
};

const textDecoder = new TextDecoder();

export async function downloadSource(): Promise<StorefrontResult<Uint8Array>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "店面下载暂时不可用。");
  }
  try {
    const sourceKey = await runtime.store.latestSourceKey();
    if (sourceKey === null) {
      return storefrontOk(await packShippedSource());
    }
    const object = await runtime.objectStorage.open(sourceKey);
    if (object === null) {
      return storefrontFail("dependency_unavailable", "店面源码暂时无法读取。");
    }
    return storefrontOk(object.bytes);
  } catch {
    return storefrontFail("dependency_unavailable", "店面下载暂时不可用。");
  }
}

export async function createRelease(input: {
  merchantId: string;
  source: Uint8Array;
  staticArchive: Uint8Array;
  fallback: string | null;
  authorizeBuyer: string | null;
  authorizeMerchant: string | null;
}): Promise<StorefrontResult<StoredRelease>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "上传服务暂时不可用。");
  }
  const validated = validateSubmission(input);
  if (!validated.ok) {
    return validated;
  }
  const limited = await consumeUpload(runtime.rateLimit, runtime.clock, input.merchantId);
  if (!limited.ok) {
    return limited;
  }
  const id = createPublicId("release");
  const sourceKey = objectKey(id, "source");
  const files: FileRow[] = validated.value.files.map((file) => ({
    releaseId: id,
    path: file.path,
    objectKey: objectKey(id, `static/${file.path}`),
    contentType: file.contentType,
    byteSize: file.bytes.byteLength,
  }));
  const storedKeys: string[] = [];
  try {
    await runtime.objectStorage.put({
      key: sourceKey,
      bytes: input.source,
      contentType: "application/zip",
    });
    storedKeys.push(sourceKey);
    for (const file of validated.value.files) {
      const row = files.find((item) => item.path === file.path);
      if (row === undefined) {
        continue;
      }
      await runtime.objectStorage.put({
        key: row.objectKey,
        bytes: file.bytes,
        contentType: file.contentType,
      });
      storedKeys.push(row.objectKey);
    }
    const release: ReleaseRow = {
      id,
      merchantId: input.merchantId,
      sourceKey,
      fallback: validated.value.fallback,
      authorizeBuyer: validated.value.authorizeBuyer,
      authorizeMerchant: validated.value.authorizeMerchant,
      createdAt: runtime.clock.now(),
    };
    await runtime.store.insertRelease(release, files);
  } catch {
    await deleteStored(runtime.objectStorage, storedKeys);
    return storefrontFail("dependency_unavailable", "上传服务暂时不可用。");
  }
  return storefrontOk({ id, active: false });
}

export async function activateRelease(
  releaseId: string,
  confirm: unknown,
): Promise<StorefrontResult<{ id: string; active: true }>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "激活暂时不可用。");
  }
  if (!activationConfirmed(confirm)) {
    return storefrontFail("validation_error", "确认激活必须带 confirm: true。");
  }
  const release = await runtime.store.getRelease(releaseId);
  if (release === null) {
    return storefrontFail("not_found", "没有找到发布。");
  }
  const files = await runtime.store.listFiles(releaseId);
  const paths = new Set(files.map((file) => file.path));
  if (!paths.has(productListFile) || !paths.has(productItemFile)) {
    return storefrontFail("validation_error", "商品页面必须声明商品槽位。");
  }
  for (const file of files) {
    if (!file.path.endsWith(".html")) {
      continue;
    }
    let object;
    try {
      object = await runtime.objectStorage.open(file.objectKey);
    } catch {
      return storefrontFail("dependency_unavailable", "激活暂时不可用。");
    }
    if (object === null) {
      return storefrontFail("dependency_unavailable", "激活暂时不可用。");
    }
    const inspected = inspectDocument(file.path, textDecoder.decode(object.bytes));
    if (!inspected.ok) {
      return inspected;
    }
  }
  const current = await runtime.store.readPointer();
  await runtime.store.writePointer(pointerAfterActivate(current, releaseId));
  return storefrontOk({ id: releaseId, active: true });
}

export async function rollbackRelease(): Promise<StorefrontResult<{ activeId: string | null }>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "回滚暂时不可用。");
  }
  const current = await runtime.store.readPointer();
  const next = pointerAfterRollback(current);
  await runtime.store.writePointer(next);
  return storefrontOk({ activeId: next.activeId });
}

function validateSubmission(input: {
  source: Uint8Array;
  staticArchive: Uint8Array;
  fallback: string | null;
  authorizeBuyer: string | null;
  authorizeMerchant: string | null;
}): StorefrontResult<{
  files: ReturnType<typeof validateStaticEntries> extends StorefrontResult<infer T> ? T : never;
  fallback: "index.html" | null;
  authorizeBuyer: string | null;
  authorizeMerchant: string | null;
}> {
  if (!isFallbackValue(input.fallback)) {
    return storefrontFail("validation_error", "回退只能声明为 index.html。");
  }
  const sourceSize = validateArchiveBytes(input.source);
  if (!sourceSize.ok) {
    return sourceSize;
  }
  const staticSize = validateArchiveBytes(input.staticArchive);
  if (!staticSize.ok) {
    return staticSize;
  }
  const sourceZip = unzip(input.source);
  if (!sourceZip.ok) {
    return storefrontFail("validation_error", "源码包无法读取。");
  }
  if (
    sourceZip.entries.some(
      (entry) => isSecretFile(entry.name) || entry.name.split("/").includes("admin"),
    )
  ) {
    return storefrontFail("validation_error", "不能上传密钥文件。");
  }
  const staticZip = unzip(input.staticArchive);
  if (!staticZip.ok) {
    return storefrontFail(
      "validation_error",
      staticZip.error === "too_large" ? "静态内容不能超过 32MiB。" : "静态包无法读取。",
    );
  }
  const files = validateStaticEntries(
    staticZip.entries.map((entry) => ({ path: entry.name, bytes: entry.bytes })),
  );
  if (!files.ok) {
    return files;
  }
  const paths = new Set(files.value.map((file) => file.path));
  const authorizeBuyer = normalizeOptionalPath(input.authorizeBuyer, paths);
  if (!authorizeBuyer.ok) {
    return authorizeBuyer;
  }
  const authorizeMerchant = normalizeOptionalPath(input.authorizeMerchant, paths);
  if (!authorizeMerchant.ok) {
    return authorizeMerchant;
  }
  return storefrontOk({
    files: files.value,
    fallback: input.fallback,
    authorizeBuyer: authorizeBuyer.value,
    authorizeMerchant: authorizeMerchant.value,
  });
}

function normalizeOptionalPath(
  value: string | null,
  paths: ReadonlySet<string>,
): StorefrontResult<string | null> {
  if (value === null || value.trim() === "") {
    return storefrontOk(null);
  }
  const path = value.replace(/^\//, "");
  if (!paths.has(path) || isReservedPath(publicPathFor(path))) {
    return storefrontFail("validation_error", "授权入口必须是已上传且非保留的页面。");
  }
  return storefrontOk(path);
}

async function consumeUpload(
  rateLimit: RateLimitPort,
  clock: { now: () => Date },
  merchantId: string,
): Promise<StorefrontResult<true>> {
  try {
    const decision = await rateLimit.reserve({
      subject: merchantId,
      policies: [storefrontUploadPolicyName],
      now: clock.now(),
    });
    if (!decision.ok) {
      if (decision.error === "limited") {
        return storefrontFail("rate_limited", "上传过于频繁，请稍后再试。");
      }
      return storefrontFail("dependency_unavailable", "上传服务暂时不可用。");
    }
    return storefrontOk(true);
  } catch {
    return storefrontFail("dependency_unavailable", "上传服务暂时不可用。");
  }
}

async function deleteStored(storage: ObjectStoragePort, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    await storage.delete(key).catch(() => undefined);
  }
}

function objectKey(releaseId: string, suffix: string): string {
  return `storefront/releases/${releaseId}/${suffix}`;
}
