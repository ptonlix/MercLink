import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const installScript = path.join(root, "scripts/install.sh");
const stampScript = path.join(root, "scripts/stamp-install.sh");

function run(command: string, args: string[], env: Record<string, string>) {
  return spawnSync(command === "bash" ? "/bin/bash" : command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function pathWithoutDocker(dir: string) {
  const bin = path.join(dir, "no-docker");
  mkdirSync(bin, { recursive: true });
  return bin;
}

function fakeBin(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

function composeFixture(dir: string) {
  const file = path.join(dir, "compose.yaml");
  writeFileSync(file, "name: merclink\nservices: {}\n");
  return file;
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined) {
    throw new Error("installer did not start");
  }
  process.kill(-child.pid, signal);
}

function waitForClose(child: ChildProcess) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    // A foreground sleep can keep the stdio pipes open after the shell exits.
    child.on("exit", () => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The process group already exited.
        }
      }
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function waitForText(child: ChildProcess, text: string, timeoutMs = 4000) {
  return new Promise<void>((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean, error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (ok) {
        resolve();
      } else {
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      finish(false, new Error(`timed out waiting for ${text}: ${stderr}`));
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.includes(text)) {
        finish(true);
      }
    });
    child.on("close", () => {
      finish(false, new Error(`installer exited before ${text}: ${stderr}`));
    });
  });
}

function stopInstaller(child: ChildProcess) {
  if (child.exitCode === null && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The process group already exited.
    }
  }
}

describe("production install script", () => {
  it("does not commit a registry username or a pinned image", () => {
    const source = readFileSync(installScript, "utf8");
    expect(source).toContain("__MERCLINK_RELEASE_TAG__");
    expect(source).toContain("__MERCLINK_IMAGE__");
    expect(source).not.toMatch(/docker\.io\/[A-Za-z0-9_.-]+\/merclink:[0-9]/);
    expect(source).not.toContain("curl -k");
    expect(source).not.toContain("apt-get");
    expect(source).not.toContain("--build");
  });

  it("stamps latest for a stable release and ignores an image override", () => {
    const stamped = run("bash", [stampScript], {
      MERCLINK_RELEASE_TAG: "v1.2.3",
      DOCKERHUB_USERNAME: "examplehub",
    });
    expect(stamped.status).toBe(0);
    expect(stamped.stdout).toContain('STAMPED_TAG="v1.2.3"');
    expect(stamped.stdout).toContain('STAMPED_IMAGE="docker.io/examplehub/merclink:latest"');
    const prerelease = run("bash", [stampScript], {
      MERCLINK_RELEASE_TAG: "v1.2.3-rc.1",
      DOCKERHUB_USERNAME: "examplehub",
    });
    expect(prerelease.status).toBe(0);
    expect(prerelease.stdout).toContain('STAMPED_IMAGE="docker.io/examplehub/merclink:1.2.3-rc.1"');
    expect(stamped.stdout).toContain('if [ "$STAMPED_TAG" = "__MERCLINK_RELEASE_TAG__" ]');

    const dir = mkdtempSync(path.join(tmpdir(), "merclink-stamp-"));
    const script = path.join(dir, "install.sh");
    writeFileSync(script, stamped.stdout);
    chmodSync(script, 0o755);
    const refused = run("bash", [script], {
      MERCLINK_INSTALL_DIR: path.join(dir, "opt"),
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:9.9.9",
      MERCLINK_RELEASE_TAG: "v9.9.9",
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: pathWithoutDocker(dir),
    });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("没有找到 Docker");
    expect(readFileSync(script, "utf8")).toContain("docker.io/examplehub/merclink:latest");

    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    fakeBin(bin, "docker", "#!/bin/sh\nexit 0\n");
    fakeBin(bin, "ss", "#!/bin/sh\nexit 0\n");
    const installed = path.join(dir, "installed");
    const wrote = run("bash", [script], {
      MERCLINK_INSTALL_DIR: installed,
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:9.9.9",
      MERCLINK_RELEASE_TAG: "v9.9.9",
      MERCLINK_COMPOSE_FILE: composeFixture(dir),
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(wrote.status, wrote.stderr).toBe(0);
    const env = readFileSync(path.join(installed, ".env"), "utf8");
    expect(env).toContain("MERCLINK_IMAGE=docker.io/examplehub/merclink:latest");
    expect(env).not.toContain("9.9.9");
  });

  it("accepts latest, and refuses a missing tag or a mismatched image", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const base = {
      MERCLINK_INSTALL_DIR: dir,
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: pathWithoutDocker(dir),
    };
    const latest = run("bash", [installScript], {
      ...base,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
    });
    expect(latest.status).not.toBe(0);
    expect(latest.stderr).toContain("没有找到 Docker");

    const mismatch = run("bash", [installScript], {
      ...base,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:1.2.4",
    });
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain("镜像地址必须是");
    expect(statSync(path.join(dir, ".env"), { throwIfNoEntry: false })).toBeUndefined();

    const prereleaseLatest = run("bash", [installScript], {
      ...base,
      MERCLINK_INSTALL_DIR: path.join(dir, "prerelease"),
      MERCLINK_RELEASE_TAG: "v1.2.3-rc.1",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
    });
    expect(prereleaseLatest.status).not.toBe(0);
    expect(prereleaseLatest.stderr).toContain("预发布不能使用 latest");

    const unstamped = run("bash", [installScript], base);
    expect(unstamped.status).not.toBe(0);
    expect(unstamped.stderr).toContain("发布页上的 install.sh");
  });

  it("writes a pinned env without starting when ports are free", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const log = path.join(dir, "docker.log");
    fakeBin(
      bin,
      "docker",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nexit 0\n`,
    );
    fakeBin(bin, "ss", "#!/bin/sh\nexit 0\n");
    const fixture = composeFixture(dir);
    const opt = path.join(dir, "opt");
    const result = run("bash", [installScript], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
      MERCLINK_COMPOSE_FILE: fixture,
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(result.status, result.stderr).toBe(0);
    const env = readFileSync(path.join(opt, ".env"), "utf8");
    expect(env).toContain("MERCLINK_IMAGE=docker.io/examplehub/merclink:latest");
    expect(env).toContain("MERCLINK_RELEASE_TAG=v1.2.3");
    expect(env).toContain("COMPOSE_PROFILES=caddy");
    expect(env).toContain("APP_BIND=127.0.0.1");
    expect(env).toContain("APP_BASE_URL=https://shop.example");
    expect(env).not.toContain("MERCLINK_PURCHASE");
    expect(env).not.toContain("MERCLINK_DEV_STUBS");
    expect(statSync(path.join(opt, ".env")).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(opt, "compose.yaml"), "utf8")).toBe(readFileSync(fixture, "utf8"));
    const commands = readFileSync(log, "utf8");
    expect(commands).toContain("compose");
    expect(commands).toContain("pull");
    expect(commands).toContain("up -d");
    expect(commands).not.toContain("--wait");
    expect(commands).not.toContain("--build");
    const password = env.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1] ?? "";
    const postgres = env.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1] ?? "";
    expect(password).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(postgres).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(result.stdout).toContain(password);
    expect(result.stdout).not.toContain(postgres);
    expect(result.stderr).not.toContain(password);
    expect(result.stderr).not.toContain(postgres);
  });

  it("does not overwrite an existing env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const opt = path.join(dir, "opt");
    mkdirSync(opt);
    writeFileSync(path.join(opt, ".env"), "POSTGRES_PASSWORD=keep-me\n", { mode: 0o600 });
    const result = run("bash", [installScript], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:1.2.3",
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: "/bin:/usr/bin",
    });
    expect(result.status).not.toBe(0);
    expect(readFileSync(path.join(opt, ".env"), "utf8")).toBe("POSTGRES_PASSWORD=keep-me\n");
  });

  it("exits before writing env when port 80 is busy or Docker is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    fakeBin(bin, "docker", "#!/bin/sh\nexit 0\n");
    fakeBin(bin, "ss", "#!/bin/sh\nprintf '%s\\n' 'LISTEN 0 128 0.0.0.0:80 0.0.0.0:*'\n");
    const opt = path.join(dir, "opt");
    const busy = run("bash", [installScript], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:1.2.3",
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(busy.status).not.toBe(0);
    expect(busy.stderr).toContain("80");
    expect(statSync(opt, { throwIfNoEntry: false })).toBeUndefined();

    const missing = run("bash", [installScript], {
      MERCLINK_INSTALL_DIR: path.join(dir, "missing-docker"),
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:1.2.3",
      APP_DOMAIN: "shop.example",
      ACME_EMAIL: "ops@example.com",
      ADMIN_PHONE: "13800138000",
      MERCLINK_ASSUME_YES: "1",
      PATH: pathWithoutDocker(dir),
    });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("没有找到 Docker");
    expect(missing.stderr).not.toContain("apt-get");
    expect(statSync(path.join(dir, "missing-docker"), { throwIfNoEntry: false })).toBeUndefined();
  });

  it("upgrades only the pinned release and keeps purchase settings", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const log = path.join(dir, "docker.log");
    fakeBin(bin, "docker", `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nexit 0\n`);
    const fixture = composeFixture(dir);
    const opt = path.join(dir, "opt");
    mkdirSync(opt);
    writeFileSync(
      path.join(opt, ".env"),
      [
        "MERCLINK_IMAGE=docker.io/examplehub/merclink:1.2.2",
        "MERCLINK_RELEASE_TAG=v1.2.2",
        "POSTGRES_PASSWORD=keep-me",
        "MERCLINK_PURCHASE=1",
        "ALIPAY_APP_ID=app",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    const result = run("bash", [installScript, "upgrade"], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
      MERCLINK_COMPOSE_FILE: fixture,
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(result.status, result.stderr).toBe(0);
    const env = readFileSync(path.join(opt, ".env"), "utf8");
    expect(env).toContain("MERCLINK_IMAGE=docker.io/examplehub/merclink:latest");
    expect(env).toContain("MERCLINK_RELEASE_TAG=v1.2.3");
    expect(env).toContain("POSTGRES_PASSWORD=keep-me");
    expect(env).toContain("MERCLINK_PURCHASE=1");
    expect(env).toContain("ALIPAY_APP_ID=app");
    expect(result.stdout).not.toContain("keep-me");
    expect(readFileSync(log, "utf8")).not.toContain("--build");
  });

  it("restores the previous release when upgrade does not finish", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    fakeBin(
      bin,
      "docker",
      '#!/bin/sh\ncase "$*" in *version*|info) exit 0 ;; esac\nexit 1\n',
    );
    const opt = path.join(dir, "opt");
    mkdirSync(opt);
    const previous = "name: merclink\nprevious: true\n";
    const previousEnv = [
      "MERCLINK_IMAGE=docker.io/examplehub/merclink:1.2.2",
      "MERCLINK_RELEASE_TAG=v1.2.2",
      "POSTGRES_PASSWORD=keep-me",
      "MERCLINK_PURCHASE=1",
      "",
    ].join("\n");
    writeFileSync(path.join(opt, "compose.yaml"), previous);
    writeFileSync(path.join(opt, ".env"), previousEnv, { mode: 0o600 });
    const result = run("bash", [installScript, "upgrade"], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
      MERCLINK_COMPOSE_FILE: composeFixture(dir),
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("已还原");
    expect(result.stderr).toContain("不会自动退回");
    expect(readFileSync(path.join(opt, "compose.yaml"), "utf8")).toBe(previous);
    const env = readFileSync(path.join(opt, ".env"), "utf8");
    expect(env).toContain("MERCLINK_IMAGE=docker.io/examplehub/merclink:1.2.2");
    expect(env).toContain("MERCLINK_RELEASE_TAG=v1.2.2");
    expect(env).toContain("POSTGRES_PASSWORD=keep-me");
    expect(env).toContain("MERCLINK_PURCHASE=1");
    expect(env).not.toContain("merclink:latest");
    expect(result.stdout).not.toContain("keep-me");
    expect(readdirSync(opt).some((name) => name.startsWith("compose.yaml.next"))).toBe(false);

    const missing = path.join(dir, "missing.yaml");
    const downloaded = run("bash", [installScript, "upgrade"], {
      MERCLINK_INSTALL_DIR: opt,
      MERCLINK_RELEASE_TAG: "v1.2.3",
      MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
      MERCLINK_COMPOSE_FILE: missing,
      PATH: `${bin}:/bin:/usr/bin`,
    });
    expect(downloaded.status, downloaded.stderr).not.toBe(0);
    expect(downloaded.stderr).toContain("已还原");
    expect(readFileSync(path.join(opt, "compose.yaml"), "utf8")).toBe(previous);
    expect(readFileSync(path.join(opt, ".env"), "utf8")).toBe(env);
    expect(readdirSync(opt).some((name) => name.startsWith("compose.yaml.next"))).toBe(false);
  });

  it("clears an unfinished install on interrupt and keeps a committed env", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    fakeBin(bin, "docker", "#!/bin/sh\nexit 0\n");
    fakeBin(bin, "ss", "#!/bin/sh\nexit 0\n");
    fakeBin(bin, "openssl", "#!/bin/sh\necho READY >&2\nsleep 30\n");
    const asking = path.join(dir, "asking");
    const asked = spawn("/bin/bash", [installScript], {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        MERCLINK_INSTALL_DIR: asking,
        MERCLINK_RELEASE_TAG: "v1.2.3",
        MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
        APP_DOMAIN: "shop.example",
        ACME_EMAIL: "ops@example.com",
        ADMIN_PHONE: "13800138000",
        MERCLINK_ASSUME_YES: "1",
        PATH: `${bin}:/bin:/usr/bin`,
      },
    });
    const askedDone = waitForClose(asked);
    try {
      await waitForText(asked, "READY");
      signalGroup(asked, "SIGINT");
      const askedResult = await askedDone;
      expect(askedResult.code).toBe(130);
      expect(askedResult.stderr).toContain("已取消，没有留下配置");
      expect(statSync(asking, { throwIfNoEntry: false })).toBeUndefined();
    } finally {
      stopInstaller(asked);
    }

    const log = path.join(dir, "docker.log");
    fakeBin(
      bin,
      "openssl",
      "#!/bin/sh\nprintf '%s\\n' 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'\n",
    );
    fakeBin(
      bin,
      "docker",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in *pull*|*up*) sleep 30 ;; esac\nexit 0\n`,
    );
    const opt = path.join(dir, "opt");
    const fixture = composeFixture(dir);
    const committed = spawn("/bin/bash", [installScript], {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        MERCLINK_INSTALL_DIR: opt,
        MERCLINK_RELEASE_TAG: "v1.2.3",
        MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
        MERCLINK_COMPOSE_FILE: fixture,
        APP_DOMAIN: "shop.example",
        ACME_EMAIL: "ops@example.com",
        ADMIN_PHONE: "13800138000",
        MERCLINK_ASSUME_YES: "1",
        PATH: `${bin}:/bin:/usr/bin`,
      },
    });
    const committedDone = waitForClose(committed);
    try {
      const envFile = path.join(opt, ".env");
      const started = Date.now();
      while (!statSync(envFile, { throwIfNoEntry: false }) && Date.now() - started < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(statSync(envFile, { throwIfNoEntry: false })).toBeDefined();
      signalGroup(committed, "SIGINT");
      const committedResult = await committedDone;
      expect(committedResult.code).toBe(130);
      expect(committedResult.stderr).toContain("不要删除");
      expect(readFileSync(envFile, "utf8")).toContain("APP_BASE_URL=https://shop.example");
      expect(readFileSync(path.join(opt, "compose.yaml"), "utf8")).toBe(
        readFileSync(fixture, "utf8"),
      );
      expect(readFileSync(log, "utf8")).not.toContain("down");
    } finally {
      stopInstaller(committed);
    }
  }, 15000);

  it("restores the release pin when upgrade is cancelled after recreate", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "merclink-install-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const log = path.join(dir, "docker.log");
    fakeBin(
      bin,
      "docker",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in *"up -d"*) echo UP_STARTED >&2; sleep 30 ;; esac\nexit 0\n`,
    );
    const opt = path.join(dir, "opt");
    mkdirSync(opt);
    const previous = "name: merclink\nprevious: true\n";
    writeFileSync(path.join(opt, "compose.yaml"), previous);
    writeFileSync(
      path.join(opt, ".env"),
      [
        "MERCLINK_IMAGE=docker.io/examplehub/merclink:1.2.2",
        "MERCLINK_RELEASE_TAG=v1.2.2",
        "POSTGRES_PASSWORD=keep-me",
        "MERCLINK_PURCHASE=1",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    const child = spawn("/bin/bash", [installScript, "upgrade"], {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        MERCLINK_INSTALL_DIR: opt,
        MERCLINK_RELEASE_TAG: "v1.2.3",
        MERCLINK_IMAGE: "docker.io/examplehub/merclink:latest",
        MERCLINK_COMPOSE_FILE: composeFixture(dir),
        PATH: `${bin}:/bin:/usr/bin`,
      },
    });
    const done = waitForClose(child);
    try {
      await waitForText(child, "UP_STARTED");
      signalGroup(child, "SIGINT");
      const result = await done;
      expect(result.code).toBe(130);
      expect(result.stderr).toContain("已还原");
      expect(result.stderr).toContain("不会自动退回");
      expect(readFileSync(path.join(opt, "compose.yaml"), "utf8")).toBe(previous);
      const env = readFileSync(path.join(opt, ".env"), "utf8");
      expect(env).toContain("MERCLINK_IMAGE=docker.io/examplehub/merclink:1.2.2");
      expect(env).toContain("MERCLINK_RELEASE_TAG=v1.2.2");
      expect(env).toContain("POSTGRES_PASSWORD=keep-me");
      expect(env).toContain("MERCLINK_PURCHASE=1");
      expect(env).not.toContain("merclink:latest");
      expect(result.stdout).not.toContain("keep-me");
      const commands = readFileSync(log, "utf8");
      expect(commands.match(/up -d/g)?.length).toBe(1);
      expect(commands).not.toContain("down");
      expect(readdirSync(opt).some((name) => name.startsWith("compose.yaml.next"))).toBe(false);
    } finally {
      stopInstaller(child);
    }
  }, 15000);
});

describe("release workflow", () => {
  it("uploads the stamped installer and keeps prereleases off the permanent entry", () => {
    const workflow = readFileSync(path.join(root, ".github/workflows/release-image.yml"), "utf8");
    expect(workflow).toContain("scripts/stamp-install.sh");
    expect(workflow).toContain("--prerelease");
    expect(workflow).toContain(
      'gh release create "${tag}" "${asset}" --target "${GITHUB_SHA}" --title "${tag}" --notes-file "${notes}"\n          else\n            gh release create "${tag}" "${asset}" --prerelease',
    );
    expect(workflow).toContain("contents: write");
    expect(workflow).not.toContain("curl -k");
    const stamp = readFileSync(stampScript, "utf8");
    expect(stamp).not.toContain("DOCKERHUB_TOKEN");
  });
});
