import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { requiredEnvKeys } from "./env";
import { systemClock } from "../ports/clock";
import type { CaptchaPort } from "../ports/captcha";
import type { PaymentPort } from "../ports/payment";
import type { SmsPort } from "../ports/sms";

const execFileAsync = promisify(execFile);

describe("foundation files", () => {
  it("pins pnpm and does not declare vendor SDKs", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      packageManager?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.packageManager).toBe("pnpm@12.9.1");
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    expect(names).toEqual(
      expect.arrayContaining([
        "next",
        "react",
        "drizzle-orm",
        "postgres",
        "zod",
        "argon2",
        "oidc-provider",
        "vitest",
      ]),
    );
    expect(names.some((name) => /alipay|aliyun|alicloud/i.test(name))).toBe(false);
    await expect(readFile("pnpm-lock.yaml", "utf8")).resolves.toContain("lockfileVersion");
    await expect(readFile("package-lock.json", "utf8")).rejects.toThrow();
    await expect(readFile("yarn.lock", "utf8")).rejects.toThrow();

    const workspace = await readFile("pnpm-workspace.yaml", "utf8");
    expect(workspace).toContain("argon2: true");
    expect(workspace).toContain("esbuild: true");
    expect(workspace).toContain("unrs-resolver: true");
  });

  it("keeps the example env free of secrets", async () => {
    const example = await readFile(".env.example", "utf8");
    for (const key of requiredEnvKeys) {
      expect(example).toContain(`${key}=`);
    }
    expect(example).not.toContain("BEGIN PRIVATE KEY");
    expect(example).not.toMatch(/^[A-Z0-9_]+=\S/m);
  });

  it("builds images with corepack pnpm and checks the CI commands", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("corepack enable");
    expect(dockerfile).toContain("corepack prepare pnpm@12.9.1 --activate");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(dockerfile).not.toMatch(/\bnpm install\b|\bnpx\b|\byarn\b/);

    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("pnpm run check");
    expect(workflow).toContain("pnpm audit --audit-level=high");
    expect(workflow.toLowerCase()).toContain("gitleaks");
    expect(workflow).not.toMatch(/(?<!p)npm audit/);
  });

  it("exposes replaceable ports without vendor clients", () => {
    const captcha: CaptchaPort = {
      verify: () => Promise.resolve({ ok: true }),
    };
    const sms: SmsPort = {
      sendCode: () => Promise.resolve({ ok: true }),
      checkCode: () => Promise.resolve({ ok: true }),
    };
    const payment: PaymentPort = {
      createPayment: () => Promise.resolve({ ok: true, action: {}, providerTradeNo: null }),
      queryPayment: () => Promise.resolve({ ok: true, status: "pending", providerTradeNo: null }),
      cancelPayment: () => Promise.resolve({ ok: true }),
      verifyNotification: () =>
        Promise.resolve({
          ok: false,
          error: "invalid_signature",
          message: "bad signature",
        }),
    };
    expect(captcha.verify).toBeTypeOf("function");
    expect(sms.sendCode).toBeTypeOf("function");
    expect(payment.verifyNotification).toBeTypeOf("function");
    expect(systemClock.now()).toBeInstanceOf(Date);
  });
});

describe("domain boundaries", () => {
  it("fails on a domain import of app and then removes that import", async () => {
    const violation = path.join("src", "domain", "_boundary_violation.ts");
    await mkdir(path.dirname(violation), { recursive: true });
    try {
      await writeFile(violation, 'import { GET } from "../app/api/health/route";\n\nvoid GET;\n');
      await expect(
        execFileAsync("pnpm", ["run", "boundaries"], { cwd: process.cwd() }),
      ).rejects.toThrow();
    } finally {
      await rm(violation, { force: true });
    }

    const passed = await execFileAsync("pnpm", ["run", "boundaries"], { cwd: process.cwd() });
    expect(passed.stderr).not.toContain("domain-no-app-db-adapters");
  }, 60_000);
});
