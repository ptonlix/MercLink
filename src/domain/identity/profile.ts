import { hasScope, type Actor } from "../../shared/actor";

export const profileRequestFields = [
  "display_name",
  "summary",
  "website_url",
  "logo_url",
  "area_served",
  "address",
  "license",
  "contact",
  "published",
] as const;

const licenseFields = [
  "name",
  "credit_code",
  "legal_person",
  "registered_address",
  "image_url",
] as const;

const contactFields = ["phone", "label", "qr_url"] as const;

const displayNameLimit = 40;
const summaryLimit = 300;
const areaLimit = 40;
const addressLimit = 120;
const urlLimit = 200;
const licenseNameLimit = 80;
const legalPersonLimit = 40;
const registeredAddressLimit = 200;
const imageUrlLimit = 500;
const contactLabelLimit = 20;
const contactPhoneMin = 5;
const contactPhoneMax = 20;

const creditCodeCharset = "0123456789ABCDEFGHJKLMNPQRTUWXY";
// GB 32100-2015 check character. Weight i is 3^(i-1) mod 31. This does not prove the entity exists.
const creditCodeWeights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28] as const;

const markupPattern = /[<>]|\[(?:[^\]]+)\]\([^)]+\)|(^|\n)#{1,6}\s|\*\*|__|~~|`/;
const imageIdPattern = /^img_[A-Za-z0-9_-]+$/;

type ProfileImagePurpose = "license" | "contact_qr";

export type OwnedProfileImage = {
  id: string;
  purpose: ProfileImagePurpose;
};

// Ownership is resolved by the caller. This module does not query storage.
export type ProfileImageContext = {
  appBaseUrl: string;
  owned: readonly OwnedProfileImage[];
};

export type ProfileLicense = {
  name: string;
  creditCode: string;
  legalPerson: string;
  registeredAddress: string;
  imageUrl: string;
};

export type ProfileContact = {
  phone: string | null;
  label: string | null;
  qrUrl: string | null;
};

export type ProfileDraft = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
  license: ProfileLicense | null;
  contact: ProfileContact | null;
  published: boolean;
};

export type ProfileSecrets = {
  phone: string;
  email: string | null;
};

type ProfileParseFailure = {
  ok: false;
  error: "validation_error" | "not_found";
  message: string;
};

export type ProfileParseResult = { ok: true; value: ProfileDraft } | ProfileParseFailure;

const emptyImages: ProfileImageContext = { appBaseUrl: "", owned: [] };

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

export function parseProfileBody(
  input: unknown,
  secrets: ProfileSecrets,
  images: ProfileImageContext = emptyImages,
): ProfileParseResult {
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

  const license = parseLicense(input.license, secrets, images);
  if (!license.ok) {
    return license;
  }
  const contact = parseContact(input.contact, secrets, images);
  if (!contact.ok) {
    return contact;
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
      license: license.value,
      contact: contact.value,
      published: input.published,
    },
  };
}

function parseLicense(
  value: unknown,
  secrets: ProfileSecrets,
  images: ProfileImageContext,
): { ok: true; value: ProfileLicense | null } | ProfileParseFailure {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(value)) {
    return invalid("执照必须是对象或 null。");
  }
  if (hasUnknownField(value, licenseFields)) {
    return invalid("不能提交未声明的字段。");
  }
  for (const field of licenseFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      return invalid("执照必须同时包含企业名称、统一社会信用代码、法人姓名、注册地址和执照图片。");
    }
  }
  const name = readText(value.name);
  const creditCode = readText(value.credit_code);
  const legalPerson = readText(value.legal_person);
  const registeredAddress = readText(value.registered_address);
  const imageUrl = readText(value.image_url);
  if (
    name === undefined ||
    creditCode === undefined ||
    legalPerson === undefined ||
    registeredAddress === undefined ||
    imageUrl === undefined
  ) {
    return invalid("执照字段必须是字符串。");
  }
  if (
    name.length === 0 ||
    creditCode.length === 0 ||
    legalPerson.length === 0 ||
    registeredAddress.length === 0 ||
    imageUrl.length === 0
  ) {
    return invalid("执照必须同时包含企业名称、统一社会信用代码、法人姓名、注册地址和执照图片。");
  }
  const texts = [name, creditCode, legalPerson, registeredAddress, imageUrl];
  const plain = rejectPublicText(texts, secrets);
  if (!plain.ok) {
    return plain;
  }
  if (containsCitizenId(legalPerson)) {
    return invalid("不能公开身份证号。");
  }
  if (textLength(name) > licenseNameLimit) {
    return invalid("企业名称不能超过 80 个字符。");
  }
  if (!isCreditCode(creditCode)) {
    return invalid("统一社会信用代码不正确。");
  }
  if (textLength(legalPerson) > legalPersonLimit) {
    return invalid("法人姓名不能超过 40 个字符。");
  }
  if (textLength(registeredAddress) > registeredAddressLimit) {
    return invalid("注册地址不能超过 200 个字符。");
  }
  const image = acceptOwnedImage(imageUrl, "license", images);
  if (!image.ok) {
    return image;
  }
  return {
    ok: true,
    value: { name, creditCode, legalPerson, registeredAddress, imageUrl },
  };
}

function parseContact(
  value: unknown,
  secrets: ProfileSecrets,
  images: ProfileImageContext,
): { ok: true; value: ProfileContact | null } | ProfileParseFailure {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(value)) {
    return invalid("客服信息必须是对象或 null。");
  }
  if (hasUnknownField(value, contactFields)) {
    return invalid("不能提交未声明的字段。");
  }
  for (const field of contactFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      return invalid("客服信息必须包含 phone、label 和 qr_url。");
    }
  }
  const phone = readNullableText(value.phone);
  const label = readNullableText(value.label);
  const qrUrl = readNullableText(value.qr_url);
  if (phone === undefined || label === undefined || qrUrl === undefined) {
    return invalid("客服字段必须是字符串或 null。");
  }
  if (phone === null && qrUrl === null) {
    return invalid("客服电话和二维码至少要有一个。");
  }
  const texts = [phone, label, qrUrl].filter((item): item is string => item !== null);
  const plain = rejectPublicText(texts, secrets);
  if (!plain.ok) {
    return plain;
  }
  if (phone !== null && !isContactPhone(phone)) {
    return invalid("客服电话格式不正确。");
  }
  if (label !== null && (label.length === 0 || textLength(label) > contactLabelLimit)) {
    return invalid("客服说明必须是 1 到 20 个字符的纯文本。");
  }
  if (qrUrl !== null) {
    const image = acceptOwnedImage(qrUrl, "contact_qr", images);
    if (!image.ok) {
      return image;
    }
  }
  return { ok: true, value: { phone, label, qrUrl } };
}

function rejectPublicText(
  values: readonly string[],
  secrets: ProfileSecrets,
): { ok: true } | ProfileParseFailure {
  if (values.some((value) => hasMarkup(value))) {
    return invalid("介绍必须是纯文本，不能包含 HTML 或 Markdown。");
  }
  if (values.some((value) => containsSecret(value, secrets))) {
    return invalid("不能公开登录手机号或账号邮箱。");
  }
  return { ok: true };
}

function acceptOwnedImage(
  value: string,
  purpose: ProfileImagePurpose,
  images: ProfileImageContext,
): { ok: true } | ProfileParseFailure {
  if (textLength(value) > imageUrlLimit || !isAbsoluteHttpUrl(value)) {
    return invalid("图片必须是本店资料图片的绝对地址。");
  }
  const id = mediaImageId(value, images.appBaseUrl);
  if (id === null) {
    return invalid("图片必须是本店资料图片的绝对地址。");
  }
  const owned = images.owned.find((item) => item.id === id);
  if (owned === undefined || owned.purpose !== purpose) {
    return missing("没有找到图片。");
  }
  return { ok: true };
}

function isCreditCode(value: string): boolean {
  if (
    value.length !== 18 ||
    !creditCodeCharacters(value).every((char) => creditCodeCharset.includes(char))
  ) {
    return false;
  }
  let sum = 0;
  for (let index = 0; index < 17; index += 1) {
    const weight = creditCodeWeights[index];
    const char = value[index];
    if (weight === undefined || char === undefined) {
      return false;
    }
    sum += creditCodeCharset.indexOf(char) * weight;
  }
  const check = (31 - (sum % 31)) % 31;
  return value[17] === creditCodeCharset[check];
}

function creditCodeCharacters(value: string): string[] {
  return Array.from(value);
}

function containsCitizenId(value: string): boolean {
  if (/\d{17}/.test(value)) {
    return true;
  }
  return /(?:^|\D)\d{15}(?:\D|$)/.test(value);
}

function isContactPhone(value: string): boolean {
  if (textLength(value) < contactPhoneMin || textLength(value) > contactPhoneMax) {
    return false;
  }
  if (!/^\+?[\d\s()-]+$/.test(value)) {
    return false;
  }
  return value.replace(/\D/g, "").length >= contactPhoneMin;
}

function invalid(message: string): ProfileParseFailure {
  return { ok: false, error: "validation_error", message };
}

function missing(message: string): ProfileParseFailure {
  return { ok: false, error: "not_found", message };
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return plainText(value);
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readText(value);
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
  return textLength(value) <= urlLimit && isAbsoluteHttpUrl(value);
}

function isAbsoluteHttpUrl(value: string): boolean {
  if (/[\s<>]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host.length > 0;
  } catch {
    return false;
  }
}

function applicationBase(raw: string): string | null {
  if (raw.trim() === "") {
    return null;
  }
  try {
    const url = new URL(raw);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

function mediaImageId(value: string, appBaseUrl: string): string | null {
  const base = applicationBase(appBaseUrl);
  if (base === null) {
    return null;
  }
  let imageUrl: URL;
  let baseUrl: URL;
  try {
    imageUrl = new URL(value);
    baseUrl = new URL(base);
  } catch {
    return null;
  }
  if (imageUrl.origin !== baseUrl.origin) {
    return null;
  }
  const prefix = `${baseUrl.pathname === "/" ? "" : baseUrl.pathname.replace(/\/$/, "")}/media/`;
  if (!imageUrl.pathname.startsWith(prefix)) {
    return null;
  }
  const id = decodeURIComponent(imageUrl.pathname.slice(prefix.length));
  if (!imageIdPattern.test(id)) {
    return null;
  }
  return id;
}

function hasUnknownField(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).some((key) => !fields.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
