import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
