import { maxStorefrontBytes, maxStorefrontEntries } from "./limits";
import { fallbackFile, isBlockedPath, isReservedPath, normalizePath } from "./paths";
import { storefrontFail, storefrontOk, type StorefrontResult } from "./result";

const contentTypes: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  map: "application/json",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

const secretNames = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  "credentials.json",
  "id_rsa",
  "id_rsa.pub",
]);

export type StaticEntry = {
  path: string;
  bytes: Uint8Array;
  contentType: string;
};

export function isSecretFile(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (secretNames.has(base) || base.startsWith(".env")) {
    return true;
  }
  return base.endsWith(".pem") || base.endsWith(".key");
}

function contentTypeFor(filePath: string): string | null {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return contentTypes[extension] ?? null;
}

export function publicPathFor(filePath: string): string {
  return normalizePath(`/${filePath}`);
}

export function validateStaticEntries(
  entries: readonly { path: string; bytes: Uint8Array }[],
): StorefrontResult<StaticEntry[]> {
  if (entries.length > maxStorefrontEntries) {
    return storefrontFail("validation_error", "静态文件过多。");
  }
  let total = 0;
  const accepted: StaticEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const path = normalizeEntryPath(entry.path);
    if (path === null) {
      return storefrontFail("validation_error", "静态路径无效。");
    }
    if (seen.has(path)) {
      return storefrontFail("validation_error", "静态路径重复。");
    }
    seen.add(path);
    if (isSecretFile(path)) {
      return storefrontFail("validation_error", "不能上传密钥文件。");
    }
    if (isReservedPath(publicPathFor(path))) {
      return storefrontFail("validation_error", "静态文件不能覆盖保留路径。");
    }
    const contentType = contentTypeFor(path);
    if (contentType === null) {
      return storefrontFail("validation_error", "静态文件类型不被接受。");
    }
    total += entry.bytes.byteLength;
    if (entry.bytes.byteLength > maxStorefrontBytes || total > maxStorefrontBytes) {
      return storefrontFail("validation_error", "静态内容不能超过 32MiB。");
    }
    accepted.push({ path, bytes: entry.bytes, contentType });
  }
  if (!seen.has(fallbackFile)) {
    return storefrontFail("validation_error", "静态目录必须包含 index.html。");
  }
  return storefrontOk(accepted);
}

export function validateArchiveBytes(bytes: Uint8Array): StorefrontResult<true> {
  if (bytes.byteLength === 0) {
    return storefrontFail("validation_error", "归档不能为空。");
  }
  if (bytes.byteLength > maxStorefrontBytes) {
    return storefrontFail("validation_error", "归档不能超过 32MiB。");
  }
  return storefrontOk(true);
}

function normalizeEntryPath(filePath: string): string | null {
  const trimmed = filePath.replaceAll("\\", "/").replace(/^\.?\//, "");
  if (trimmed.length === 0 || trimmed.endsWith("/")) {
    return null;
  }
  if (isBlockedPath(trimmed) || trimmed.startsWith("/")) {
    return null;
  }
  if (isSecretFile(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return null;
  }
  return trimmed;
}

export function isFallbackValue(value: string | null): value is "index.html" | null {
  return value === null || value === fallbackFile;
}
