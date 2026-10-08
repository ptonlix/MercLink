import { catalogFail, catalogOk, type CatalogResult } from "./result";

export const maxImageBytes = 5 * 1024 * 1024;
export const imageUploadLimit = 30;
export const imageUploadWindowMs = 60_000;
export const imageUploadPolicyName = "image-upload";

export function imageUploadPolicies(): {
  readonly "image-upload": { readonly limit: number; readonly windowMs: number };
} {
  return {
    [imageUploadPolicyName]: { limit: imageUploadLimit, windowMs: imageUploadWindowMs },
  };
}

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

const jpegSignature = [0xff, 0xd8, 0xff] as const;
const pngSignature = [0x89, 0x50, 0x4e, 0x47] as const;
const riffSignature = [0x52, 0x49, 0x46, 0x46] as const;
const webpSignature = [0x57, 0x45, 0x42, 0x50] as const;

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function applicationBase(raw: string): string {
  const url = new URL(raw);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.origin}${path}`;
}

export function mediaUrl(appBaseUrl: string, id: string): string {
  return `${applicationBase(appBaseUrl)}/media/${id}`;
}

export function mediaImageId(cover: string, appBaseUrl: string): string | null {
  if (appBaseUrl.trim() === "") {
    return null;
  }
  let coverUrl: URL;
  let base: string;
  try {
    coverUrl = new URL(cover);
    base = applicationBase(appBaseUrl);
  } catch {
    return null;
  }
  const baseUrl = new URL(base);
  if (coverUrl.origin !== baseUrl.origin) {
    return null;
  }
  const prefix = `${baseUrl.pathname === "/" ? "" : baseUrl.pathname.replace(/\/$/, "")}/media/`;
  if (!coverUrl.pathname.startsWith(prefix)) {
    return null;
  }
  const id = decodeURIComponent(coverUrl.pathname.slice(prefix.length));
  if (!/^img_[A-Za-z0-9_-]+$/.test(id)) {
    return null;
  }
  return id;
}

export function detectImage(
  bytes: Uint8Array,
): CatalogResult<{ contentType: ImageContentType; byteSize: number }> {
  if (bytes.byteLength === 0) {
    return catalogFail("validation_error", "图片不能为空。");
  }
  if (bytes.byteLength > maxImageBytes) {
    return catalogFail("validation_error", "图片不能超过 5 MiB。");
  }
  if (startsWith(bytes, jpegSignature)) {
    return catalogOk({ contentType: "image/jpeg", byteSize: bytes.byteLength });
  }
  if (startsWith(bytes, pngSignature)) {
    return catalogOk({ contentType: "image/png", byteSize: bytes.byteLength });
  }
  if (startsWith(bytes, riffSignature) && startsWith(bytes, webpSignature, 8)) {
    return catalogOk({ contentType: "image/webp", byteSize: bytes.byteLength });
  }
  return catalogFail("validation_error", "只接受 JPEG、PNG 或 WebP。");
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}
