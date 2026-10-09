import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isSecretFile } from "../../domain/storefront/archive";
import { zipStore, type ZipEntry } from "./zip";

const skippedDirectories = new Set(["node_modules", ".git"]);

function shippedSourceRoot(): string {
  return path.join(process.cwd(), "storefront");
}

export async function packShippedSource(root = shippedSourceRoot()): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  await walk(root, root, entries);
  return zipStore(entries);
}

async function walk(root: string, directory: string, entries: ZipEntry[]): Promise<void> {
  const names = await readdir(directory, { withFileTypes: true });
  for (const name of names) {
    if (skippedDirectories.has(name.name) || isSecretFile(name.name)) {
      continue;
    }
    const absolute = path.join(directory, name.name);
    if (name.isDirectory()) {
      await walk(root, absolute, entries);
      continue;
    }
    if (!name.isFile()) {
      continue;
    }
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (relative.includes("/admin/") || relative.startsWith("admin/")) {
      continue;
    }
    entries.push({ name: relative, bytes: await readFile(absolute) });
  }
}
