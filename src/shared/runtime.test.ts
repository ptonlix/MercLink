import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";
import { loadEnv, requiredEnvKeys } from "./env";
import { formatRequestLog } from "./log";

const canary = "canary-secret-do-not-print";

describe("startup refusal", () => {
  it("fails loadEnv when any object storage or Redis variable is missing", () => {
    const source = Object.fromEntries(requiredEnvKeys.map((key) => [key, `value-${key}`]));
    for (const key of [
      "REDIS_URL",
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_REGION",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_ACCESS_KEY_ID",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ] as const) {
      const missing = { ...source };
      delete missing[key];
      const loaded = loadEnv(missing);
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.missing).toContain(key);
      }
    }
  });

  it("exits non-zero without ALIPAY_PRIVATE_KEY and does not print secrets", async () => {
    const env = filledEnv();
    delete env.ALIPAY_PRIVATE_KEY;

    const result = await runStartup(env);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain("ALIPAY_PRIVATE_KEY");
    expect(result.output).not.toContain(canary);
    expect(result.output).not.toContain("BEGIN PRIVATE KEY");
  }, 20_000);

  it("exits non-zero without REDIS_URL and does not add a second Redis variable", async () => {
    expect(requiredEnvKeys.filter((key) => key.includes("REDIS"))).toEqual(["REDIS_URL"]);
    const env = filledEnv();
    delete env.REDIS_URL;

    const result = await runStartup(env);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain("REDIS_URL");
    expect(result.output).not.toContain(canary);
  }, 20_000);
});

describe("health", () => {
  it("returns 200 without a token and without secrets", async () => {
    const response = GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: "ok" });
    expect(text).not.toContain("postgres://");
    expect(text).not.toContain("BEGIN PRIVATE KEY");
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl !== undefined && databaseUrl !== "") {
      expect(text).not.toContain(databaseUrl);
    }
    const privateKey = process.env.ALIPAY_PRIVATE_KEY;
    if (privateKey !== undefined && privateKey !== "") {
      expect(text).not.toContain(privateKey);
    }
  });
});

describe("request logs", () => {
  it("omits bearer tokens, passwords, and SMS codes", () => {
    const token = "token-canary-do-not-log";
    const password = "pw-canary-do-not-log";
    const smsCode = "sms-canary-do-not-log";
    const refreshToken = "refresh-canary-do-not-log";
    const line = formatRequestLog({
      method: "POST",
      path: "/api/v1/orders",
      headers: new Headers({ authorization: `Bearer ${token}` }),
      bodyText: JSON.stringify({
        password,
        sms_code: smsCode,
        refresh_token: refreshToken,
      }),
    });

    expect(line).not.toContain(token);
    expect(line).not.toContain(password);
    expect(line).not.toContain(smsCode);
    expect(line).not.toContain(refreshToken);
    expect(line).toContain("[redacted]");
  });
});

function filledEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of requiredEnvKeys) {
    env[key] = `${canary}-${key}`;
  }
  return env;
}

async function runStartup(env: NodeJS.ProcessEnv): Promise<{ code: number; output: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "merclink-start-"));
  const hook = path.join(dir, "hook.mjs");
  const register = path.join(dir, "register.mjs");
  await writeFile(
    hook,
    `export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.(?:[cm]?js|json|ts|tsx|css)$/.test(specifier)) {
    return nextResolve(specifier + ".ts", context);
  }
  return nextResolve(specifier, context);
}
`,
  );
  await writeFile(
    register,
    `import { register } from "node:module";
register(${JSON.stringify(pathToFileURL(hook).href)}, ${JSON.stringify(pathToFileURL(dir + path.sep).href)});
`,
  );

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", register, "src/shared/startup.ts"], {
        cwd: process.cwd(),
        env,
      });
      let output = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 15_000);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, output });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
