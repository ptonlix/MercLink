import { hasScope, type Actor } from "../../shared/actor";

export const profileRequestFields = [
  "display_name",
  "summary",
  "website_url",
  "logo_url",
  "area_served",
  "address",
  "published",
] as const;

const displayNameLimit = 40;
const summaryLimit = 300;
const areaLimit = 40;
const addressLimit = 120;
const urlLimit = 200;

const markupPattern = /[<>]|\[(?:[^\]]+)\]\([^)]+\)|(^|\n)#{1,6}\s|\*\*|__|~~|`/;

export type ProfileDraft = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
  published: boolean;
};

export type ProfileSecrets = {
  phone: string;
  email: string | null;
};

type ProfileParseFailure = {
  ok: false;
  error: "validation_error";
  message: string;
};

export type ProfileParseResult = { ok: true; value: ProfileDraft } | ProfileParseFailure;

export function merchantOwnerId(actor: Actor): string | undefined {
  if (actor.type === "merchant") {
    return actor.merchantId;
  }
  if (actor.type === "script" && actor.ownerType === "merchant") {
    return actor.ownerId;
  }
  return undefined;
}

export function canWriteProfile(actor: Actor): boolean {
  return merchantOwnerId(actor) !== undefined && hasScope(actor, "product:write");
}

export function parseProfileBody(input: unknown, secrets: ProfileSecrets): ProfileParseResult {
  if (!isRecord(input)) {
    return invalid("请求体必须是 JSON 对象。");
  }
  const unknown = Object.keys(input).filter(
    (key) => !(profileRequestFields as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return invalid("不能提交未声明的字段。");
  }
  for (const field of profileRequestFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return invalid("请求缺少必填字段。");
    }
  }
  const displayName = readText(input.display_name);
  const summary = readText(input.summary);
  const websiteUrl = readOptional(input.website_url);
  const logoUrl = readOptional(input.logo_url);
  const areaServed = readOptional(input.area_served);
  const address = readOptional(input.address);
  if (
    displayName === undefined ||
    summary === undefined ||
    websiteUrl === undefined ||
    logoUrl === undefined ||
    areaServed === undefined ||
    address === undefined
  ) {
    return invalid("字段类型不正确。");
  }
  if (typeof input.published !== "boolean") {
    return invalid("published 必须是布尔值。");
  }

  const texts = [displayName, summary, websiteUrl, logoUrl, areaServed, address];
  if (texts.some((value) => value !== null && hasMarkup(value))) {
    return invalid("介绍必须是纯文本，不能包含 HTML 或 Markdown。");
  }
  if (texts.some((value) => value !== null && containsSecret(value, secrets))) {
    return invalid("不能公开登录手机号或账号邮箱。");
  }

  if (textLength(displayName) > displayNameLimit) {
    return invalid("展示名不能超过 40 个字符。");
  }
  if (textLength(summary) > summaryLimit) {
    return invalid("简介不能超过 300 个字符。");
  }
  if (areaServed !== null && textLength(areaServed) > areaLimit) {
    return invalid("服务区域不能超过 40 个字符。");
  }
  if (address !== null && textLength(address) > addressLimit) {
    return invalid("地址不能超过 120 个字符。");
  }
  if (input.published && (displayName.length === 0 || summary.length === 0)) {
    return invalid("发布时展示名和简介都不能为空。");
  }
  if (websiteUrl !== null && !isPublicHttpUrl(websiteUrl)) {
    return invalid("网站必须是不超过 200 个字符的 http 或 https 地址。");
  }
  if (logoUrl !== null && !isPublicHttpUrl(logoUrl)) {
    return invalid("标识必须是不超过 200 个字符的 http 或 https 地址。");
  }

  return {
    ok: true,
    value: {
      displayName,
      summary,
      websiteUrl,
      logoUrl,
      areaServed,
      address,
      published: input.published,
    },
  };
}

function invalid(message: string): ProfileParseFailure {
  return { ok: false, error: "validation_error", message };
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return plainText(value);
}

function readOptional(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const text = plainText(value);
  return text.length === 0 ? null : text;
}

function plainText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "").trim();
}

function textLength(value: string): number {
  return Array.from(value).length;
}

function hasMarkup(value: string): boolean {
  return markupPattern.test(value);
}

function containsSecret(value: string, secrets: ProfileSecrets): boolean {
  const phone = secrets.phone.replace(/\D/g, "");
  if (phone.length > 0 && value.replace(/\D/g, "").includes(phone)) {
    return true;
  }
  const email = secrets.email?.trim().toLowerCase() ?? "";
  return email.length > 0 && value.toLowerCase().includes(email);
}

function isPublicHttpUrl(value: string): boolean {
  if (textLength(value) > urlLimit || /[\s<>]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host.length > 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
