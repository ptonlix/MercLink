import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertRuntimeDependencies } from "./runtime-deps";

describe("runtime dependencies", () => {
  it("refuses startup when Redis or the bucket cannot be reached", async () => {
    await expect(
      assertRuntimeDependencies({
        redis: { ping: () => Promise.reject(new Error("down")) },
        objectStorage: { headBucket: () => Promise.resolve() },
      }),
    ).rejects.toThrow(/Redis is unreachable/);
    await expect(
      assertRuntimeDependencies({
        redis: { ping: () => Promise.resolve("PONG") },
        objectStorage: { headBucket: () => Promise.reject(new Error("missing")) },
      }),
    ).rejects.toThrow(/Object storage bucket is unreachable/);
  });

  it("keeps Redis and object storage out of the domain and off local disk", async () => {
    const domain = await sourceFiles(path.join(process.cwd(), "src/domain"));
    for (const file of domain) {
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("redis");
      expect(text).not.toContain("@aws-sdk/client-s3");
    }
    const registration = await readFile(
      path.join(process.cwd(), "src/domain/identity/registration.ts"),
      "utf8",
    );
    expect(registration).toContain('"sms_rate_limited"');
    expect(registration).not.toContain('"rate_limited"');

    const architecture = await readFile(path.join(process.cwd(), "docs/ARCHITECTURE.md"), "utf8");
    expect(architecture).toContain("图片字节只进 S3 或 MinIO，没有本地目录兜底");
    expect(architecture).toContain("没有本地目录适配器");
    expect(architecture).not.toContain("MEDIA_ROOT");

    const assembly = await readFile(
      path.join(process.cwd(), "src/composition/register-all.ts"),
      "utf8",
    );
    expect(assembly).toContain("assertRuntimeDependencies");
    expect(assembly).toContain("createS3ObjectStorage");
    expect(assembly).not.toContain("local file");
    expect(assembly).not.toContain("MEDIA_ROOT");
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}
