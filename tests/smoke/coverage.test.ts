import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { smokeKey, smokeManifest, smokeMethods } from "./manifest";

describe("smoke coverage", () => {
  it("lists every exported route method without calling the server", async () => {
    const exported = await exportedRoutes();
    const listed = new Set(smokeManifest.map((route) => smokeKey(route)));
    const missing = exported.filter((route) => !listed.has(smokeKey(route)));
    const extra = smokeManifest.filter(
      (route) => !exported.some((item) => smokeKey(item) === smokeKey(route)),
    );

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});

async function exportedRoutes(): Promise<{ method: string; path: string }[]> {
  const root = path.join(process.cwd(), "src/app");
  const files = (await walk(root)).filter((file) => file.endsWith(`${path.sep}route.ts`));
  const found: { method: string; path: string }[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(root, file).split(path.sep).join("/");
    const routePath = `/${relative.replace(/\/route\.ts$/, "").replace(/\[(\.\.\.)?([^\]]+)\]/g, (_match, dots: string | undefined, name: string) => (dots === undefined ? `{${name}}` : `{...${name}}`))}`;
    for (const method of smokeMethods) {
      const exported =
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source) ||
        new RegExp(`export\\s+const\\s+${method}\\b`).test(source);
      if (exported) {
        found.push({ method, path: routePath });
      }
    }
  }
  return found;
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}
