import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { currentPurchaseEnabled } from "../shared/purchase-mode";

export type StarterName =
  | "index.html"
  | "products/index.html"
  | "products/item.html"
  | "account/buyer.html"
  | "account/merchant.html"
  | "pay/result.html";

const starterTitles: Record<StarterName, string> = {
  "index.html": "店面",
  "products/index.html": "商品",
  "products/item.html": "商品",
  "account/buyer.html": "买家授权",
  "account/merchant.html": "商家登录",
  "pay/result.html": "订单",
};

const starterNames: readonly StarterName[] = [
  "index.html",
  "products/index.html",
  "products/item.html",
  "account/buyer.html",
  "account/merchant.html",
  "pay/result.html",
];

type StarterFragments = Record<StarterName, string>;
type PurchaseKey = "0" | "1";
type BakedPayloads = Record<PurchaseKey, StarterFragments>;

// Next compiles every static import of this module into the App Route graph and
// rejects react-dom/server there. A separate Node process renders the same templates.
// The image has no compiler and no script, so the build writes both purchase payloads.
// A checkout that still has the script keeps rendering, and a leftover JSON must not win.
// Both payloads stay cached so resetting the purchase-mode cache can select the other one.
const bakedByRoot = new Map<string, BakedPayloads>();
const renderedByRoot = new Map<string, Partial<Record<PurchaseKey, StarterFragments>>>();

export function parseStarterFragments(payload: string): StarterFragments {
  const parsed: unknown = JSON.parse(payload);
  return parseStarterRecord(parsed);
}

function parseBakedPayloads(payload: string): BakedPayloads {
  const parsed: unknown = JSON.parse(payload);
  const record = asRecord(parsed);
  return {
    "0": parseStarterRecord(record["0"]),
    "1": parseStarterRecord(record["1"]),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("starter fragments are not an object");
  }
  return value as Record<string, unknown>;
}

function parseStarterRecord(value: unknown): StarterFragments {
  const record = asRecord(value);
  const loaded = {} as StarterFragments;
  for (const name of starterNames) {
    const page = record[name];
    if (typeof page !== "string" || page.length === 0) {
      throw new Error(`starter fragment missing: ${name}`);
    }
    loaded[name] = page;
  }
  return loaded;
}

function purchaseKey(): PurchaseKey {
  return currentPurchaseEnabled() ? "1" : "0";
}

function starterFragments(root: string): StarterFragments {
  const script = path.join(root, "scripts/render-starter.mjs");
  if (existsSync(script)) {
    return fragmentsFromScript(root, script);
  }
  return bakedPayloads(root)[purchaseKey()];
}

function fragmentsFromScript(root: string, script: string): StarterFragments {
  const key = purchaseKey();
  const cached = renderedByRoot.get(root)?.[key];
  if (cached !== undefined) {
    return cached;
  }
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "starter render failed");
  }
  const rendered = parseStarterFragments(result.stdout);
  const bucket = renderedByRoot.get(root) ?? {};
  bucket[key] = rendered;
  renderedByRoot.set(root, bucket);
  return rendered;
}

function bakedPayloads(root: string): BakedPayloads {
  const cached = bakedByRoot.get(root);
  if (cached !== undefined) {
    return cached;
  }
  const loaded = parseBakedPayloads(
    readFileSync(path.join(root, "storefront-starter.json"), "utf8"),
  );
  bakedByRoot.set(root, loaded);
  return loaded;
}

function starterFragment(name: StarterName, root: string): string {
  return starterFragments(root)[name];
}

export function starterDocument(name: StarterName, root = process.cwd()): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${starterTitles[name]}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    ${starterFragment(name, root)}
  </body>
</html>
`;
}

export function starterStyles(): string {
  const root = process.cwd();
  const globals = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  const publicCss = readFileSync(path.join(root, "src/public-discovery/public.css"), "utf8");
  const authorizeCss = readFileSync(path.join(root, "src/app/authorize/authorize.css"), "utf8");
  return `${globals}\n${publicCss}\n${authorizeCss}`;
}
