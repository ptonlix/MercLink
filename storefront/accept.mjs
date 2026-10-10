import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const reservedPrefixes = ["/api", "/authorize", "/oauth", "/admin", "/media", "/.well-known"];
const reservedExact = new Set([
  "/skill.md",
  "/merchant/skill.md",
  "/storefront/skill.md",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
]);
const productSlots = [
  "product.name",
  "product.cover",
  "product.fields",
  "product.variants",
  "product.stock",
  "product.availability",
  "product.price",
];
const pricePattern =
  /[¥￥]\s*\d|\d+(?:\.\d{1,2})?\s*元|(?:价格|售价|单价|标价)\s*[:：]?\s*\d|price\s*[:=]\s*\d/i;
const stockPattern = /库存\s*[:：]?\s*\d|stock\s*[:=]\s*\d/i;
const successPattern = /支付成功|付款成功|payment\s+success/i;
const storeLiteralPattern = /(?:展示名|店铺简介|店名|服务区域|店铺地址|店铺标识)\s*[:：]\s*[^\s<]/;
const orderLiteralPattern = /订单状态\s*[:：]\s*(?:paid|pending|closed)|status\s*[:=]\s*["']?paid/i;
const passwordPattern = /支付宝密码|支付密码|alipay\s+password/i;
const jsonLdMimeType = "application/ld+json";
// Keep this above the top-level await. A later const is still uninitialized while accept() runs.
const namedAttributeReferences = {
  amp: "&",
  AMP: "&",
  apos: "'",
  gt: ">",
  GT: ">",
  lt: "<",
  LT: "<",
  plus: "+",
  quot: '"',
  QUOT: '"',
  sol: "/",
};
const secretNames = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  "credentials.json",
  "id_rsa",
  "id_rsa.pub",
]);
const slotPattern = /<merclink-slot\s+name="([a-z0-9._-]+)"\s*>\s*<\/merclink-slot>/g;
const paidTemplatePattern = /<template\s+data-merclink="order\.paid">[\s\S]*?<\/template>/g;

const directory = process.argv[2] ?? "static";

try {
  await accept(directory);
} catch (error) {
  const message = error instanceof Error ? error.message : "acceptance failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function accept(root) {
  const files = await walk(root);
  if (!files.some((file) => file.path === "index.html")) {
    fail("missing_slot", "静态目录必须包含 index.html。");
  }
  for (const file of files) {
    if (isSecret(file.path) || isReserved(file.path)) {
      fail("reserved_path", `保留路径或密钥文件：${file.path}`);
    }
  }
  for (const required of ["products/index.html", "products/item.html"]) {
    if (!files.some((file) => file.path === required)) {
      fail("missing_slot", `缺少商品页面 ${required}`);
    }
  }
  for (const file of files) {
    if (!file.path.endsWith(".html")) {
      continue;
    }
    const html = await readFile(path.join(root, file.path), "utf8");
    inspect(file.path, html);
  }
}

function inspect(filePath, html) {
  if (containsMerchantJsonLd(html)) {
    fail("authored_jsonld", `${filePath} 包含 application/ld+json。`);
  }
  if (passwordPattern.test(html)) {
    fail("alipay_password", `${filePath} 索要支付宝密码。`);
  }
  if (filePath === "products/index.html" || filePath === "products/item.html") {
    for (const name of productSlots) {
      if (!html.includes(`<merclink-slot name="${name}"></merclink-slot>`)) {
        fail("missing_slot", `${filePath} 缺少 ${name}`);
      }
    }
  }
  if (
    filePath === "products/index.html" &&
    !html.includes('<merclink-slot name="products.next"></merclink-slot>')
  ) {
    fail("missing_slot", `${filePath} 缺少 products.next`);
  }
  const withoutPaid = html.replace(paidTemplatePattern, "");
  if (successPattern.test(withoutPaid) || orderLiteralPattern.test(stripSlots(withoutPaid))) {
    fail("payment_success", `${filePath} 在未读取 paid 时显示成功。`);
  }
  if (
    (successPattern.test(html) || html.includes('data-merclink="order.paid"')) &&
    !html.includes('<merclink-slot name="order.status"></merclink-slot>')
  ) {
    fail("missing_slot", `${filePath} 展示订单事实却没有订单槽位。`);
  }
  const visible = stripSlots(withoutPaid);
  if (
    pricePattern.test(visible) ||
    stockPattern.test(visible) ||
    storeLiteralPattern.test(visible)
  ) {
    fail("hardcoded_fact", `${filePath} 写死了店铺、商品或订单事实。`);
  }
}

function stripSlots(html) {
  return html.replace(slotPattern, "");
}

// Same JSON-LD type check as src/domain/storefront/slots.ts. This file cannot import TypeScript.
function containsMerchantJsonLd(html) {
  let cursor = 0;
  while (cursor < html.length) {
    const tag = nextScriptOpen(html, cursor);
    if (tag === null) {
      return false;
    }
    if (tag.type !== null && isMerchantJsonLdType(tag.type)) {
      return true;
    }
    cursor = tag.openEnd > cursor ? tag.openEnd : tag.start + 1;
  }
  return false;
}

function isMerchantJsonLdType(value) {
  const decoded = decodeAttributeCharacterReferences(value).trim().toLowerCase();
  if (decoded === jsonLdMimeType) {
    return true;
  }
  if (!decoded.startsWith(jsonLdMimeType)) {
    return false;
  }
  const next = decoded.charAt(jsonLdMimeType.length);
  return next.length > 0 && /\W/.test(next);
}

function decodeAttributeCharacterReferences(value) {
  return value.replace(
    /&(?:#(?:x([0-9a-fA-F]+)|([0-9]+));?|([A-Za-z]+);)/g,
    (match, hex, decimal, name) => {
      if (name !== undefined) {
        return namedAttributeReferences[name] ?? match;
      }
      const digits = hex ?? decimal;
      if (digits === undefined) {
        return match;
      }
      const codePoint = Number.parseInt(digits, hex === undefined ? 10 : 16);
      if (
        !Number.isInteger(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "\uFFFD";
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function nextScriptOpen(html, from) {
  const pattern = /<script\b/gi;
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (match === null) {
    return null;
  }
  return parseScriptOpen(html, match.index);
}

function parseScriptOpen(html, start) {
  let index = start + "<script".length;
  let type = null;
  while (index < html.length) {
    index = skipWhitespace(html, index);
    if (index >= html.length) {
      return { start, openEnd: html.length, type };
    }
    const char = html.charAt(index);
    if (char === ">") {
      return { start, openEnd: index + 1, type };
    }
    if (char === "/" && html.charAt(index + 1) === ">") {
      return { start, openEnd: index + 2, type };
    }
    const nameStart = index;
    while (index < html.length && !/[\s=/>]/.test(html.charAt(index))) {
      index += 1;
    }
    const name = html.slice(nameStart, index);
    if (name.length === 0) {
      index += 1;
      continue;
    }
    index = skipWhitespace(html, index);
    if (index >= html.length || html.charAt(index) !== "=") {
      if (type === null && name.toLowerCase() === "type") {
        type = "";
      }
      continue;
    }
    index += 1;
    index = skipWhitespace(html, index);
    if (index >= html.length) {
      return { start, openEnd: html.length, type };
    }
    const quote = html.charAt(index);
    let value = "";
    if (quote === '"' || quote === "'") {
      index += 1;
      const valueStart = index;
      while (index < html.length && html.charAt(index) !== quote) {
        index += 1;
      }
      value = html.slice(valueStart, index);
      if (index < html.length) {
        index += 1;
      }
    } else {
      const valueStart = index;
      while (index < html.length && !/[\s>]/.test(html.charAt(index))) {
        index += 1;
      }
      value = html.slice(valueStart, index);
    }
    if (type === null && name.toLowerCase() === "type") {
      type = value;
    }
  }
  return { start, openEnd: html.length, type };
}

function skipWhitespace(html, index) {
  let cursor = index;
  while (cursor < html.length && /\s/.test(html.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}


function isReserved(filePath) {
  const urlPath = `/${filePath}`;
  if (reservedExact.has(urlPath)) {
    return true;
  }
  return reservedPrefixes.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`));
}

function isSecret(filePath) {
  const base = filePath.split("/").pop() ?? filePath;
  if (secretNames.has(base) || base.startsWith(".env")) {
    return true;
  }
  return base.endsWith(".pem") || base.endsWith(".key");
}

async function walk(directory) {
  const found = [];
  await visit(directory, "", found);
  return found;
}

async function visit(directory, prefix, found) {
  const names = await readdir(directory, { withFileTypes: true });
  for (const name of names) {
    const relative = prefix.length === 0 ? name.name : `${prefix}/${name.name}`;
    const absolute = path.join(directory, name.name);
    if (name.isDirectory()) {
      await visit(absolute, relative, found);
      continue;
    }
    if (name.isFile()) {
      found.push({ path: relative });
    }
  }
}

function fail(reason, message) {
  throw new Error(`${reason}: ${message}`);
}
