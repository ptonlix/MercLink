import { createPublicId } from "../../shared/id";
import {
  detectImage,
  imageUploadPolicyName,
  maxImageBytes,
  mediaImageId,
  mediaUrl,
  type ImageContentType,
} from "../../domain/catalog/images";
import { catalogFail, catalogOk, type CatalogResult } from "../../domain/catalog/result";
import type { ObjectStoragePort } from "../../ports/object-storage";
import type { RateLimitPort } from "../../ports/rate-limit";
import { apiError } from "../../shared/errors";
import { lockCatalog, ownedCatalog, type Db, type Sql } from "./db";
import { mediaRuntime } from "./media-runtime";

export type StoredImage = {
  id: string;
  url: string;
  contentType: ImageContentType;
  byteSize: number;
};

export type ImageError =
  "validation_error" | "not_found" | "rate_limited" | "dependency_unavailable";

export type ImageResult<T> =
  { ok: true; value: T } | { ok: false; error: ImageError; message: string };

function imageHttpStatus(error: ImageError): number {
  switch (error) {
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "dependency_unavailable":
      return 503;
    default:
      return 400;
  }
}

export function imageResponse<T>(
  result: ImageResult<T>,
  map: (value: T) => unknown,
  status = 200,
): Response {
  if (!result.ok) {
    return apiError(result.error, result.message, imageHttpStatus(result.error));
  }
  return Response.json(map(result.value), { status });
}

export async function ownedMediaCover(
  db: Db,
  input: {
    merchantId: string;
    catalogId: string;
    cover: string | null;
    appBaseUrl: string;
  },
): Promise<CatalogResult<string | null>> {
  if (input.cover === null) {
    return catalogOk(null);
  }
  const imageId = mediaImageId(input.cover, input.appBaseUrl);
  if (imageId === null) {
    return catalogOk(input.cover);
  }
  const rows = await db<{ id: string }[]>`
    SELECT id FROM product_images
    WHERE id = ${imageId}
      AND merchant_id = ${input.merchantId}
      AND catalog_id = ${input.catalogId}
  `;
  if (rows.length === 0) {
    return catalogFail("not_found", "没有找到图片。");
  }
  return catalogOk(input.cover);
}

export async function uploadCatalogImage(
  sql: Sql,
  merchantId: string,
  catalogId: string,
  request: Request,
): Promise<ImageResult<StoredImage>> {
  const runtime = mediaRuntime();
  if (runtime === undefined) {
    return imageFail("dependency_unavailable", "上传服务暂时不可用。");
  }
  const limited = await consumeUpload(runtime.rateLimit, runtime.clock, merchantId);
  if (!limited.ok) {
    return limited;
  }
  const file = await readImageFile(request);
  if (!file.ok) {
    return file;
  }
  const detected = detectImage(file.value);
  if (!detected.ok) {
    return imageFail("validation_error", detected.message);
  }
  const catalog = ownedCatalog(await lockCatalog(sql, catalogId), merchantId);
  if (catalog === undefined) {
    return imageFail("not_found", "没有找到目录。");
  }
  const id = createPublicId("image");
  try {
    await runtime.objectStorage.put({
      key: id,
      bytes: file.value,
      contentType: detected.value.contentType,
    });
  } catch {
    return imageFail("dependency_unavailable", "上传服务暂时不可用。");
  }
  try {
    await sql`
      INSERT INTO product_images (id, merchant_id, catalog_id, content_type, byte_size)
      VALUES (
        ${id},
        ${merchantId},
        ${catalogId},
        ${detected.value.contentType},
        ${detected.value.byteSize}
      )
    `;
  } catch {
    await runtime.objectStorage.delete(id).catch(() => undefined);
    return imageFail("dependency_unavailable", "上传服务暂时不可用。");
  }
  return {
    ok: true,
    value: {
      id,
      url: mediaUrl(runtime.mediaBaseUrl, id),
      contentType: detected.value.contentType,
      byteSize: detected.value.byteSize,
    },
  };
}

export async function readPublicImage(
  sql: Sql,
  storage: ObjectStoragePort,
  id: string,
): Promise<ImageResult<{ bytes: Uint8Array; contentType: string }>> {
  const rows = await sql<{ content_type: string }[]>`
    SELECT content_type FROM product_images WHERE id = ${id}
  `;
  const row = rows[0];
  if (row === undefined) {
    return imageFail("not_found", "没有找到图片。");
  }
  try {
    const object = await storage.open(id);
    if (object === null) {
      return imageFail("dependency_unavailable", "图片暂时无法读取。");
    }
    return { ok: true, value: { bytes: object.bytes, contentType: row.content_type } };
  } catch {
    return imageFail("dependency_unavailable", "图片暂时无法读取。");
  }
}

export function publicImageResponse(
  result: ImageResult<{ bytes: Uint8Array; contentType: string }>,
): Response {
  if (!result.ok) {
    return apiError(result.error, result.message, imageHttpStatus(result.error));
  }
  return new Response(binaryBody(result.value.bytes), {
    status: 200,
    headers: {
      "content-type": result.value.contentType,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}

function binaryBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function consumeUpload(
  rateLimit: RateLimitPort,
  clock: { now: () => Date },
  merchantId: string,
): Promise<ImageResult<true>> {
  try {
    const decision = await rateLimit.reserve({
      subject: merchantId,
      policies: [imageUploadPolicyName],
      now: clock.now(),
    });
    if (!decision.ok) {
      if (decision.error === "limited") {
        return imageFail("rate_limited", "上传过于频繁，请稍后再试。");
      }
      return imageFail("dependency_unavailable", "上传服务暂时不可用。");
    }
    return { ok: true, value: true };
  } catch {
    return imageFail("dependency_unavailable", "上传服务暂时不可用。");
  }
}

async function readImageFile(request: Request): Promise<ImageResult<Uint8Array>> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return imageFail("validation_error", "请使用 multipart/form-data 上传一个文件。");
  }
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      continue;
    }
    if (key !== "file") {
      return imageFail("validation_error", "文件字段名必须是 file。");
    }
    files.push(value);
  }
  if (files.length !== 1) {
    return imageFail("validation_error", "每次只能上传一个文件。");
  }
  const file = files[0];
  if (file === undefined || file.size === 0) {
    return imageFail("validation_error", "图片不能为空。");
  }
  if (file.size > maxImageBytes) {
    return imageFail("validation_error", "图片不能超过 5 MiB。");
  }
  return { ok: true, value: new Uint8Array(await file.arrayBuffer()) };
}

function imageFail(error: ImageError, message: string): ImageResult<never> {
  return { ok: false, error, message };
}
