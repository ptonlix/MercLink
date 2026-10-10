import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isSecretFile } from "../../domain/storefront/archive";
import {
  starterDocument,
  starterStyles,
  type StarterName,
} from "../../public-discovery/starter-markup";
import { zipStore, type ZipEntry } from "./zip";

const skippedDirectories = new Set(["node_modules", ".git"]);
const generatedPaths = new Set([
  "static/index.html",
  "static/products/index.html",
  "static/products/item.html",
  "static/account/buyer.html",
  "static/account/merchant.html",
  "static/pay/result.html",
  "static/styles.css",
]);

function shippedSourceRoot(): string {
  return path.join(process.cwd(), "storefront");
}

export function generatedStarterEntries(): ZipEntry[] {
  const text = new TextEncoder();
  const pages: StarterName[] = [
    "index.html",
    "products/index.html",
    "products/item.html",
    "account/buyer.html",
    "account/merchant.html",
    "pay/result.html",
  ];
  return [
    ...pages.map((name) => ({
      name: `static/${name}`,
      bytes: text.encode(starterDocument(name)),
    })),
    { name: "static/styles.css", bytes: text.encode(starterStyles()) },
  ];
}

export async function packShippedSource(root = shippedSourceRoot()): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  await walk(root, root, entries);
  entries.push(...generatedStarterEntries());
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
    if (
      relative.includes("/admin/") ||
      relative.startsWith("admin/") ||
      generatedPaths.has(relative)
    ) {
      continue;
    }
    entries.push({ name: relative, bytes: await readFile(absolute) });
  }
}
