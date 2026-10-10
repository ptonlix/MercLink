import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

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

type StarterFragments = Record<StarterName, string>;

// Next compiles every static import of this module into the App Route graph and
// rejects react-dom/server there. A separate Node process renders the same templates.
let fragments: StarterFragments | null = null;

function starterFragments(): StarterFragments {
  if (fragments !== null) {
    return fragments;
  }
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts/render-starter.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "starter render failed");
  }
  fragments = JSON.parse(result.stdout) as StarterFragments;
  return fragments;
}

function starterFragment(name: StarterName): string {
  return starterFragments()[name];
}

export function starterDocument(name: StarterName): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${starterTitles[name]}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    ${starterFragment(name)}
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
