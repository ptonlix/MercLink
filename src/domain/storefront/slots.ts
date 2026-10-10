import { productItemFile, productListFile } from "./paths";
import { storefrontFail, storefrontOk, type StorefrontResult } from "./result";

const storeSlotNames = [
  "store.display_name",
  "store.summary",
  "store.logo",
  "store.website",
  "store.area",
  "store.address",
] as const;

const productSlotNames = [
  "product.name",
  "product.cover",
  "product.fields",
  "product.variants",
  "product.stock",
  "product.availability",
  "product.price",
] as const;

const orderStatusSlot = "order.status";

const productNextSlot = "products.next";

const slotPattern = /<merclink-slot\s+name="([a-z0-9._-]+)"\s*>\s*<\/merclink-slot>/g;

const storeSlotDeclared = /<merclink-slot\s+name="store\.[a-z0-9._-]+"\s*>/;

const productSlotDeclared = /<merclink-slot\s+name="product\.[a-z0-9._-]+"\s*>/;

const jsonLdMimeType = "application/ld+json";

const productTemplatePattern = /<template\s+data-merclink="product">([\s\S]*?)<\/template>/g;

const paidTemplatePattern = /<template\s+data-merclink="order\.paid">([\s\S]*?)<\/template>/g;

const pricePattern =
  /[¥￥]\s*\d|\d+(?:\.\d{1,2})?\s*元|(?:价格|售价|单价|标价)\s*[:：]?\s*\d|price\s*[:=]\s*\d/i;

const stockPattern = /库存\s*[:：]?\s*\d|stock\s*[:=]\s*\d/i;

const successPattern = /支付成功|付款成功|payment\s+success/i;

const storeLiteralPattern = /(?:展示名|店铺简介|店名|服务区域|店铺地址|店铺标识)\s*[:：]\s*[^\s<]/;

const orderLiteralPattern = /订单状态\s*[:：]\s*(?:paid|pending|closed)|status\s*[:=]\s*["']?paid/i;

const passwordPattern = /支付宝密码|支付密码|alipay\s+password/i;

type SlotVariant = {
  optionValues: Readonly<Record<string, string>>;
  stock: number | null;
  availability: string;
  priceMinor: number;
};

export type SlotProduct = {
  id: string;
  name: string;
  cover: string | null;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  variants: readonly SlotVariant[];
  stock: number | null;
  availability: string;
  priceMinor: number;
};

export type SlotStore = {
  displayName: string;
  summary: string;
  logo: string | null;
  website: string | null;
  area: string | null;
  address: string | null;
};

export type SlotContext = {
  store: SlotStore | null;
  products: readonly SlotProduct[];
  product: SlotProduct | null;
  orderStatus: string | null;
  nextCursor: string | null;
};

export function majorUnitPrice(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${negative ? "-" : ""}¥${String(whole)}.${String(fraction).padStart(2, "0")}`;
}

export function documentHasSlots(html: string): boolean {
  return html.includes("<merclink-slot") || html.includes('data-merclink="');
}

export function documentDeclaresStoreSlots(html: string): boolean {
  return storeSlotDeclared.test(html);
}

export function documentDeclaresProductSlots(html: string): boolean {
  return productSlotDeclared.test(html);
}

export function containsMerchantJsonLd(html: string): boolean {
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

export function stripMerchantJsonLd(html: string): string {
  let result = "";
  let cursor = 0;
  while (cursor < html.length) {
    const tag = nextScriptOpen(html, cursor);
    if (tag === null) {
      return result + html.slice(cursor);
    }
    if (tag.type === null || !isMerchantJsonLdType(tag.type)) {
      const next = tag.openEnd > cursor ? tag.openEnd : tag.start + 1;
      result += html.slice(cursor, next);
      cursor = next;
      continue;
    }
    result += html.slice(cursor, tag.start);
    const closeEnd = scriptCloseEnd(html, tag.openEnd);
    if (closeEnd === null) {
      return result;
    }
    cursor = closeEnd;
  }
  return result;
}

// HTML decodes numeric and named character references in one attribute-value pass.
// storefront/accept.mjs duplicates this check; it cannot import TypeScript.
const namedAttributeReferences: Readonly<Record<string, string>> = {
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

function isMerchantJsonLdType(value: string): boolean {
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

function decodeAttributeCharacterReferences(value: string): string {
  return value.replace(
    /&(?:#(?:x([0-9a-fA-F]+)|([0-9]+));?|([A-Za-z]+);)/g,
    (match, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
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

type ScriptOpen = {
  start: number;
  openEnd: number;
  type: string | null;
};

function nextScriptOpen(html: string, from: number): ScriptOpen | null {
  const pattern = /<script\b/gi;
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (match === null) {
    return null;
  }
  return parseScriptOpen(html, match.index);
}

function parseScriptOpen(html: string, start: number): ScriptOpen {
  let index = start + "<script".length;
  let type: string | null = null;
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

function skipWhitespace(html: string, index: number): number {
  let cursor = index;
  while (cursor < html.length && /\s/.test(html.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function scriptCloseEnd(html: string, from: number): number | null {
  const pattern = /<\/script\s*>/gi;
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (match === null) {
    return null;
  }
  return match.index + match[0].length;
}

export function inspectDocument(filePath: string, html: string): StorefrontResult<true> {
  if (containsMerchantJsonLd(html)) {
    return storefrontFail("validation_error", "页面不能包含 application/ld+json。");
  }
  if (passwordPattern.test(html)) {
    return storefrontFail("validation_error", "页面不能索要支付宝密码。");
  }
  if (filePath === productListFile || filePath === productItemFile) {
    for (const name of productSlotNames) {
      if (!hasSlot(html, name)) {
        return storefrontFail("validation_error", "商品页面必须声明商品槽位。");
      }
    }
  }
  if (filePath === productListFile && !hasSlot(html, productNextSlot)) {
    return storefrontFail("validation_error", "商品列表必须声明下一页槽位。");
  }
  const withoutPaid = html.replace(paidTemplatePattern, "");
  if (successPattern.test(withoutPaid) || orderLiteralPattern.test(stripSlots(withoutPaid))) {
    return storefrontFail("validation_error", "不能写死支付成功或订单状态。");
  }
  if (
    (successPattern.test(html) || html.includes('data-merclink="order.paid"')) &&
    !hasSlot(html, orderStatusSlot)
  ) {
    return storefrontFail("validation_error", "展示订单状态必须使用订单槽位。");
  }
  const visible = stripSlots(withoutPaid);
  if (
    pricePattern.test(visible) ||
    stockPattern.test(visible) ||
    storeLiteralPattern.test(visible)
  ) {
    return storefrontFail("validation_error", "不能写死价格、库存或店铺资料。");
  }
  return storefrontOk(true);
}

export function renderDocument(html: string, context: SlotContext): string {
  const expanded = html.replace(productTemplatePattern, (_match, inner: string) => {
    const products =
      context.products.length > 0
        ? context.products
        : context.product === null
          ? []
          : [context.product];
    return products.map((product) => fillProduct(inner, product)).join("");
  });
  const withProduct = context.product === null ? expanded : fillProduct(expanded, context.product);
  const withStore = withProduct.replace(slotPattern, (match, name: string) => {
    const value = storeSlotValue(name, context.store) ?? nextSlotValue(name, context.nextCursor);
    return value ?? match;
  });
  const withStatus = withStore.replace(slotPattern, (match, name: string) => {
    if (name !== orderStatusSlot) {
      return match;
    }
    return escapeHtml(context.orderStatus ?? "");
  });
  const paid = context.orderStatus === "paid";
  return withStatus.replace(paidTemplatePattern, (_match, inner: string) => (paid ? inner : ""));
}

function fillProduct(html: string, product: SlotProduct): string {
  const withId = html.replaceAll("{id}", escapeHtml(product.id));
  return withId.replace(slotPattern, (match, name: string) => {
    const value = productSlotValue(name, product);
    return value ?? match;
  });
}

function productSlotValue(name: string, product: SlotProduct): string | null {
  switch (name) {
    case "product.name":
      return escapeHtml(product.name);
    case "product.cover":
      return imageHtml(product.cover, product.name);
    case "product.fields":
      return fieldList(product.fields);
    case "product.variants":
      return variantList(product.variants);
    case "product.stock":
      return product.stock === null ? "" : escapeHtml(String(product.stock));
    case "product.availability":
      return escapeHtml(product.availability);
    case "product.price":
      return escapeHtml(majorUnitPrice(product.priceMinor));
    default:
      return null;
  }
}

function storeSlotValue(name: string, store: SlotStore | null): string | null {
  if (!storeSlotNames.includes(name as (typeof storeSlotNames)[number])) {
    return null;
  }
  if (store === null) {
    return "";
  }
  switch (name) {
    case "store.display_name":
      return escapeHtml(store.displayName);
    case "store.summary":
      return escapeHtml(store.summary);
    case "store.logo":
      return imageHtml(store.logo, store.displayName);
    case "store.website":
      return linkHtml(store.website);
    case "store.area":
      return escapeHtml(store.area ?? "");
    case "store.address":
      return escapeHtml(store.address ?? "");
    default:
      return null;
  }
}

function nextSlotValue(name: string, nextCursor: string | null): string | null {
  if (name !== productNextSlot) {
    return null;
  }
  if (nextCursor === null || nextCursor.length === 0) {
    return "";
  }
  const href = `/products?cursor=${encodeURIComponent(nextCursor)}`;
  return `<a href="${escapeHtml(href)}">下一页商品</a>`;
}

function hasSlot(html: string, name: string): boolean {
  return new RegExp(`<merclink-slot\\s+name="${name}"\\s*>\\s*</merclink-slot>`).test(html);
}

function stripSlots(html: string): string {
  return html.replace(slotPattern, "");
}

function fieldList(fields: SlotProduct["fields"]): string {
  const items = Object.entries(fields).map(
    ([key, value]) =>
      `<li>${escapeHtml(key)}: ${escapeHtml(value === null ? "" : String(value))}</li>`,
  );
  return items.length === 0 ? "" : `<ul>${items.join("")}</ul>`;
}

function variantList(variants: readonly SlotVariant[]): string {
  const items = variants.map((variant) => {
    const options = Object.entries(variant.optionValues)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    const stock = variant.stock === null ? "" : String(variant.stock);
    const text = [options, majorUnitPrice(variant.priceMinor), variant.availability, stock]
      .filter((part) => part.length > 0)
      .join(" · ");
    return `<li>${escapeHtml(text)}</li>`;
  });
  return items.length === 0 ? "" : `<ul>${items.join("")}</ul>`;
}

function imageHtml(url: string | null, alt: string): string {
  if (url === null || !isHttpUrl(url)) {
    return "";
  }
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}

function linkHtml(url: string | null): string {
  if (url === null || url.length === 0) {
    return "";
  }
  if (!isHttpUrl(url)) {
    return escapeHtml(url);
  }
  const safe = escapeHtml(url);
  return `<a href="${safe}">${safe}</a>`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
