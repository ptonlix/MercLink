import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { ObjectStoragePort, StoredObject } from "../../ports/object-storage";

export type ObjectStorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type ObjectCommandClient = {
  send: (command: object) => Promise<unknown>;
};

export function objectStorageClientConfig(config: ObjectStorageConfig): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
}

export function createObjectStorageClient(config: ObjectStorageConfig): S3Client {
  return new S3Client(objectStorageClientConfig(config));
}

export function createS3ObjectStorage(input: {
  client: ObjectCommandClient;
  bucket: string;
}): ObjectStoragePort {
  const bucket = input.bucket;
  return {
    put: async (object) => {
      await input.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: object.key,
          Body: object.bytes,
          ContentType: object.contentType,
        }),
      );
    },
    open: async (key) => openObject(input.client, bucket, key),
    delete: async (key) => {
      await input.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    headBucket: async () => {
      await input.client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}

async function openObject(
  client: ObjectCommandClient,
  bucket: string,
  key: string,
): Promise<StoredObject | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await bytesFrom(result);
    if (bytes === null) {
      return null;
    }
    const contentType = contentTypeFrom(result) ?? "application/octet-stream";
    return { bytes, contentType };
  } catch (error: unknown) {
    if (isMissingObject(error)) {
      return null;
    }
    throw error;
  }
}

async function bytesFrom(result: unknown): Promise<Uint8Array | null> {
  if (typeof result !== "object" || result === null || !("Body" in result)) {
    return null;
  }
  const body = result.Body;
  if (typeof body !== "object" || body === null || !("transformToByteArray" in body)) {
    return null;
  }
  const transform = body.transformToByteArray;
  if (typeof transform !== "function") {
    return null;
  }
  const raw: unknown = await transform.call(body);
  return raw instanceof Uint8Array ? raw : null;
}

function contentTypeFrom(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("ContentType" in result)) {
    return null;
  }
  return typeof result.ContentType === "string" ? result.ContentType : null;
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = "name" in error ? error.name : undefined;
  if (name === "NoSuchKey" || name === "NotFound") {
    return true;
  }
  const metadata = "$metadata" in error ? error.$metadata : undefined;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    metadata.httpStatusCode === 404
  );
}
