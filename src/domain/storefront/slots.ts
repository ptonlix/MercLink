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
const fieldTemplatePattern = /<template\s+data-merclink="product\.field">([\s\S]*?)<\/template>/g;
const variantTemplatePattern =
  /<template\s+data-merclink="product\.variant">([\s\S]*?)<\/template>/g;

const emptyProductsTemplatePattern =
  /<template\s+data-merclink="products\.empty">([\s\S]*?)<\/template>/g;

const paidTemplatePattern = /<template\s+data-merclink="order\.paid">([\s\S]*?)<\/template>/g;

const pricePattern =
  /[¥￥]\s*\d|\d+(?:\.\d{1,2})?\s*元|(?:价格|售价|单价|标价)\s*[:：]?\s*\d|price\s*[:=]\s*\d/i;

const stockPattern = /库存\s*[:：]?\s*\d|stock\s*[:=]\s*\d/i;

const successPattern = /支付成功|付款成功|payment\s+success/i;

const storeLiteralPattern = /(?:展示名|店铺简介|店名|服务区域|店铺地址|店铺标识)\s*[:：]\s*[^\s<]/;

const orderLiteralPattern = /订单状态\s*[:：]\s*(?:paid|pending|closed)|status\s*[:=]\s*["']?paid/i;

const passwordPattern = /支付宝密码|支付密码|alipay\s+password/i;

type SlotVariant = {
  id?: string;
  sku?: string | null;
  currency?: string;
  optionValues: Readonly<Record<string, string>>;
  stock: number | null;
  availability: string;
  priceMinor: number;
};

export type SlotProduct = {
  id: string;
  name: string;
  catalogId?: string;
  cover: string | null;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  variants: readonly SlotVariant[];
  stock: number | null;
  availability: string;
  priceMinor: number;
  currency?: string;
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
  origin?: string;
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
    for (const name of [
      "product.name",
      "product.cover",
      "product.price",
      "product.availability",
    ] as const) {
      if (!hasSlot(html, name)) {
        return storefrontFail("validation_error", "商品页面必须声明商品槽位。");
      }
    }
  }
  if (filePath === productItemFile && !declaresFields(html)) {
    return storefrontFail("validation_error", "商品页面必须声明商品槽位。");
  }
  if (filePath === productItemFile && !declaresVariants(html)) {
    return storefrontFail("validation_error", "商品页面必须声明商品槽位。");
  }
  if (filePath === productListFile && !hasSlot(html, productNextSlot)) {
    return storefrontFail("validation_error", "商品列表必须声明下一页槽位。");
  }
  const withoutPaid = html.replace(paidTemplatePattern, "");
  if (
    successPattern.test(withoutPaid.replaceAll("不表示支付成功", "")) ||
    orderLiteralPattern.test(stripSlots(withoutPaid))
  ) {
    return storefrontFail("validation_error", "不能写死支付成功或订单状态。");
  }
  if (
    (successPattern.test(html.replaceAll("不表示支付成功", "")) ||
      html.includes('data-merclink="order.paid"')) &&
    !hasSlot(html, orderStatusSlot)
  ) {
    return storefrontFail("validation_error", "展示订单状态必须使用订单槽位。");
  }
  const visible = stripSlots(withoutPaid)
    .replaceAll("不表示支付成功", "")
    .replaceAll("预算 200 元", "");
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
  const hasProducts = context.products.length > 0 || context.product !== null;
  const withoutEmpty = html.replace(emptyProductsTemplatePattern, (_match, inner: string) =>
    hasProducts ? "" : inner,
  );
  const expanded = withoutEmpty.replace(productTemplatePattern, (_match, inner: string) => {
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
    if (name === "site.origin") {
      return escapeHtml(context.origin ?? "");
    }
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

export function slotHtml(
  name: string,
  context: SlotContext,
  product?: SlotProduct | null,
): string | null {
  if (name === "site.origin") {
    return escapeHtml(context.origin ?? "");
  }
  if (name === orderStatusSlot) {
    return escapeHtml(context.orderStatus ?? "");
  }
  if (name.startsWith("product.")) {
    return product === undefined || product === null ? null : productSlotValue(name, product);
  }
  return storeSlotValue(name, context.store) ?? nextSlotValue(name, context.nextCursor);
}

function fillProduct(html: string, product: SlotProduct): string {
  const expanded = expandVariantTemplates(expandFieldTemplates(html, product), product);
  const withId = expanded
    .replaceAll("{id}", escapeHtml(product.id))
    .replaceAll("{catalogId}", escapeHtml(product.catalogId ?? ""))
    .replaceAll("{priceMinor}", escapeHtml(String(product.priceMinor)))
    .replaceAll("{availabilityRaw}", escapeHtml(product.availability))
    .replaceAll("{currency}", escapeHtml(product.currency ?? "CNY"));
  return withId.replace(slotPattern, (match, name: string) => {
    const value = productSlotValue(name, product, html);
    return value ?? match;
  });
}

function expandFieldTemplates(html: string, product: SlotProduct): string {
  if (!html.includes('data-merclink="product.field"')) {
    return html;
  }
  return html.replace(fieldTemplatePattern, (_match, inner: string) => {
    const entries = Object.entries(product.fields);
    return entries
      .map(([key, value]) =>
        fillNamedSlots(inner, {
          "field.key": key,
          "field.value": fieldText(value),
        }),
      )
      .join("");
  });
}

function expandVariantTemplates(html: string, product: SlotProduct): string {
  if (!html.includes('data-merclink="product.variant"')) {
    return html;
  }
  return html.replace(variantTemplatePattern, (_match, inner: string) =>
    product.variants
      .map((variant) =>
        fillNamedSlots(inner, {
          "variant.id": variant.id ?? "",
          "variant.options": optionText(variant),
          "variant.price": slotDisplayPrice(variant.priceMinor, variant.currency ?? "CNY"),
          "variant.stock": variant.stock === null ? "" : String(variant.stock),
          "variant.availability": availabilityLabel(variant.availability),
          "variant.sku": variant.sku ?? "",
        }),
      )
      .join(""),
  );
}

function fillNamedSlots(html: string, values: Readonly<Record<string, string>>): string {
  return html.replace(slotPattern, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : escapeHtml(value);
  });
}

function productSlotValue(name: string, product: SlotProduct, html = ""): string | null {
  if (!productSlotNames.includes(name as (typeof productSlotNames)[number])) {
    return null;
  }
  switch (name) {
    case "product.name":
      return escapeHtml(product.name);
    case "product.cover":
      return imageHtml(product.cover, product.name, "cover");
    case "product.fields":
      return html.includes('data-merclink="product.field"') ? "" : fieldList(product.fields);
    case "product.variants":
      return html.includes('data-merclink="product.variant"') ? "" : variantList(product.variants);
    case "product.stock":
      return product.stock === null ? "" : escapeHtml(String(product.stock));
    case "product.availability":
      return escapeHtml(availabilityLabel(product.availability));
    case "product.price":
      return escapeHtml(slotDisplayPrice(product.priceMinor, product.currency ?? "CNY"));
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
      return imageHtml(store.logo, store.displayName, "logo");
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

function declaresFields(html: string): boolean {
  return hasSlot(html, "product.fields") || html.includes('data-merclink="product.field"');
}

function declaresVariants(html: string): boolean {
  return hasSlot(html, "product.variants") || html.includes('data-merclink="product.variant"');
}

function optionText(variant: SlotVariant): string {
  const options = Object.entries(variant.optionValues)
    .map(([key, value]) => `${key}=${value}`)
    .join("，");
  return options.length === 0 ? "默认规格" : options;
}

function fieldText(value: string | number | boolean | null): string {
  if (value === null) {
    return "未填写";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return String(value);
}

function stripSlots(html: string): string {
  return html.replace(slotPattern, "");
}

function fieldList(fields: SlotProduct["fields"]): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return '<p class="muted">没有公开字段。</p>';
  }
  const rows = entries.map(([key, value]) => {
    const text =
      value === null
        ? "未填写"
        : typeof value === "boolean"
          ? value
            ? "是"
            : "否"
          : String(value);
    return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(text)}</dd></div>`;
  });
  return `<dl class="facts">${rows.join("")}</dl>`;
}

function variantList(variants: readonly SlotVariant[]): string {
  const items = variants.map((variant) => {
    const options = Object.entries(variant.optionValues)
      .map(([key, value]) => `${key}=${value}`)
      .join("，");
    const stock =
      variant.stock === null
        ? "不限库存"
        : variant.stock === 0
          ? "缺货"
          : `库存 ${String(variant.stock)} 件`;
    const price = slotDisplayPrice(variant.priceMinor, variant.currency ?? "CNY");
    const sku =
      variant.sku === null || variant.sku === undefined || variant.sku.length === 0
        ? ""
        : `<span class="muted">SKU：${escapeHtml(variant.sku)}</span>`;
    const id =
      variant.id === undefined
        ? ""
        : `<span class="identifier">规格 ID：${escapeHtml(variant.id)}</span>`;
    return `<li><strong>${escapeHtml(options.length === 0 ? "默认规格" : options)}</strong><span class="price">${escapeHtml(price)}</span><span>${escapeHtml(`${stock} · ${availabilityLabel(variant.availability)}`)}</span>${sku}${id}</li>`;
  });
  return items.length === 0 ? "" : `<ul class="variants">${items.join("")}</ul>`;
}

function imageHtml(url: string | null, alt: string, frame: "cover" | "logo" = "cover"): string {
  if (frame === "logo" && (url === null || !isHttpUrl(url))) {
    return "";
  }
  const label = frame === "logo" ? "店铺标识" : "暂无图片";
  const image =
    url !== null && isHttpUrl(url) ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : "";
  const hidden = image.length > 0 ? ' aria-hidden="true"' : "";
  return `<span class="${frame}"><span class="placeholder"${hidden}>${label}</span>${image}</span>`;
}

function slotDisplayPrice(minor: number, currency: string): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const value = `${negative ? "-" : ""}${String(whole)}.${String(fraction).padStart(2, "0")}`;
  return currency === "CNY" ? `¥${value}` : `${currency} ${value}`;
}

function availabilityLabel(value: string): string {
  if (value === "in_stock") {
    return "有货";
  }
  if (value === "out_of_stock") {
    return "缺货";
  }
  return value;
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
