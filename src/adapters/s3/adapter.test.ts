import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertRuntimeDependencies } from "../../composition/runtime-deps";
import { createS3ObjectStorage, objectStorageClientConfig } from "./adapter";

const bucket = "merclink-images";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

describe("s3 object storage", () => {
  it("sends bytes only to the configured bucket", async () => {
    const sent: object[] = [];
    const storage = createS3ObjectStorage({
      bucket,
      client: {
        send: (command) => {
          sent.push(command);
          if (command instanceof GetObjectCommand) {
            return Promise.resolve({
              ContentType: "image/png",
              Body: { transformToByteArray: () => Promise.resolve(png) },
            });
          }
          return Promise.resolve({});
        },
      },
    });

    await storage.put({ key: "img_one", bytes: png, contentType: "image/png" });
    await storage.open("img_one");
    await storage.delete("img_one");
    await storage.headBucket();

    const buckets = sent.map((command) => bucketOf(command));
    expect(buckets).toEqual([bucket, bucket, bucket, bucket]);
    expect(buckets).not.toContain("other-bucket");
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(sent[1]).toBeInstanceOf(GetObjectCommand);
    expect(sent[2]).toBeInstanceOf(DeleteObjectCommand);
    expect(sent[3]).toBeInstanceOf(HeadBucketCommand);
    if (sent[0] instanceof PutObjectCommand) {
      expect(sent[0].input.Key).toBe("img_one");
      expect(sent[0].input.Body).toBe(png);
    }
  });

  it("refuses startup when HeadBucket fails", async () => {
    const storage = createS3ObjectStorage({
      bucket,
      client: {
        send: () => Promise.reject(new Error("NoSuchBucket")),
      },
    });
    await expect(storage.headBucket()).rejects.toThrow(/NoSuchBucket/);
    await expect(
      assertRuntimeDependencies({
        redis: { ping: () => Promise.resolve("PONG") },
        objectStorage: storage,
      }),
    ).rejects.toThrow(/Object storage bucket is unreachable/);
  });

  it("uses path-style addressing and does not register a local directory adapter", async () => {
    expect(
      objectStorageClientConfig({
        endpoint: "http://minio:9000",
        region: "us-east-1",
        accessKeyId: "merclink",
        secretAccessKey: "merclinkminio",
      }).forcePathStyle,
    ).toBe(true);

    const files = await sourceFiles(path.join(process.cwd(), "src"));
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("MEDIA_ROOT");
      expect(text).not.toContain("data/media");
    }
    expect(
      files.some((file) => file.includes(`${path.sep}adapters${path.sep}local${path.sep}`)),
    ).toBe(false);
  });
});

function bucketOf(command: object): string | undefined {
  if (!("input" in command) || typeof command.input !== "object" || command.input === null) {
    return undefined;
  }
  if (!("Bucket" in command.input)) {
    return undefined;
  }
  return typeof command.input.Bucket === "string" ? command.input.Bucket : undefined;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
      continue;
    }
    if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(full);
    }
  }
  return files;
}
