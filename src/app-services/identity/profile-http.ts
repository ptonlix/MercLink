import { getDatabase, type Sql } from "../../db/client";
import {
  canWriteProfile,
  merchantOwnerId,
  parseProfileBody,
  type ProfileDraft,
} from "../../domain/identity/profile";
import { apiFailure, apiSuccess } from "../../shared/errors";
import { authenticate } from "../../shared/seams/authenticate";
import {
  publicStore,
  resetPublicStore,
  type PublicStoreProfile,
} from "../../shared/seams/public-store";
import {
  createSqlProfileStore,
  type MerchantProfileStore,
  type StoredProfile,
} from "./profile-store";

let boundStore: MerchantProfileStore | undefined;

export function bindMerchantProfileStore(store: MerchantProfileStore | undefined): void {
  boundStore = store;
  if (store === undefined) {
    resetPublicStore();
    return;
  }
  publicStore.register({ get: () => store.readPublished() });
}

export function resetMerchantProfileStore(): void {
  boundStore = undefined;
  resetPublicStore();
}

export function registerMerchantProfile(sql: Sql): void {
  bindMerchantProfileStore(createSqlProfileStore(sql));
}

export async function getMerchantProfile(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  const merchantId = merchantOwnerId(auth.actor);
  if (merchantId === undefined) {
    return apiFailure("forbidden", "需要商家权限。", { request });
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return apiFailure("forbidden", "需要商家权限。", { request });
  }
  const row = await store.readOwn(merchantId);
  return apiSuccess(merchantProfileJson(row), { request });
}

export async function putMerchantProfile(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  const merchantId = merchantOwnerId(auth.actor);
  if (merchantId === undefined) {
    return apiFailure("forbidden", "需要商家权限。", { request });
  }
  if (!canWriteProfile(auth.actor)) {
    return apiFailure("forbidden", "缺少所需权限。", { request });
  }
  if (!isJsonContentType(request)) {
    return apiFailure("validation_error", "请求体必须是 application/json。", { request });
  }
  const parsedBody = await readJson(request);
  if (!parsedBody.ok) {
    return apiFailure("validation_error", parsedBody.message, { request });
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return apiFailure("forbidden", "需要商家权限。", { request });
  }
  const parsed = parseProfileBody(parsedBody.value, secrets, {
    appBaseUrl: process.env.APP_BASE_URL?.trim() ?? "",
    owned: await store.ownedImages(merchantId),
  });
  if (!parsed.ok) {
    return apiFailure(parsed.error, parsed.message, { request });
  }
  const current = await store.readOwn(merchantId);
  const saved =
    current !== null && sameProfile(current, parsed.value)
      ? current
      : await store.replace(merchantId, parsed.value);
  return apiSuccess(merchantProfileJson(saved), { request });
}

export async function getPublicStore(request?: Request): Promise<Response> {
  ensureStore();
  const store = await publicStore.get();
  if (store === null) {
    return apiFailure("not_found", "没有已发布的店铺介绍。", { request });
  }
  return apiSuccess(publicStoreJson(store), { request });
}

function ensureStore(): MerchantProfileStore {
  if (boundStore !== undefined) {
    return boundStore;
  }
  const store = createSqlProfileStore(getDatabase().sql);
  bindMerchantProfileStore(store);
  return store;
}

function merchantProfileJson(row: StoredProfile | null): {
  display_name: string;
  summary: string;
  website_url: string | null;
  logo_url: string | null;
  area_served: string | null;
  address: string | null;
  license: ReturnType<typeof licenseJson>;
  contact: ReturnType<typeof contactJson>;
  published: boolean;
  updated_at: string | null;
} {
  if (row === null) {
    return {
      display_name: "",
      summary: "",
      website_url: null,
      logo_url: null,
      area_served: null,
      address: null,
      license: null,
      contact: null,
      published: false,
      updated_at: null,
    };
  }
  return {
    display_name: row.displayName,
    summary: row.summary,
    website_url: row.websiteUrl,
    logo_url: row.logoUrl,
    area_served: row.areaServed,
    address: row.address,
    license: licenseJson(row.license),
    contact: contactJson(row.contact),
    published: row.published,
    updated_at: row.updatedAt.toISOString(),
  };
}

function publicStoreJson(store: PublicStoreProfile): {
  display_name: string;
  summary: string;
  website_url: string | null;
  logo_url: string | null;
  area_served: string | null;
  address: string | null;
  license: ReturnType<typeof licenseJson>;
  contact: ReturnType<typeof contactJson>;
} {
  return {
    display_name: store.displayName,
    summary: store.summary,
    website_url: store.websiteUrl,
    logo_url: store.logoUrl,
    area_served: store.areaServed,
    address: store.address,
    license: licenseJson(store.license),
    contact: contactJson(store.contact),
  };
}

function licenseJson(license: ProfileDraft["license"]): {
  name: string;
  credit_code: string;
  legal_person: string;
  registered_address: string;
  image_url: string;
} | null {
  if (license === null) {
    return null;
  }
  return {
    name: license.name,
    credit_code: license.creditCode,
    legal_person: license.legalPerson,
    registered_address: license.registeredAddress,
    image_url: license.imageUrl,
  };
}

function contactJson(contact: ProfileDraft["contact"]): {
  phone: string | null;
  label: string | null;
  qr_url: string | null;
} | null {
  if (contact === null) {
    return null;
  }
  return {
    phone: contact.phone,
    label: contact.label,
    qr_url: contact.qrUrl,
  };
}

function sameProfile(stored: StoredProfile, next: ProfileDraft): boolean {
  return (
    stored.displayName === next.displayName &&
    stored.summary === next.summary &&
    stored.websiteUrl === next.websiteUrl &&
    stored.logoUrl === next.logoUrl &&
    stored.areaServed === next.areaServed &&
    stored.address === next.address &&
    sameLicense(stored.license, next.license) &&
    sameContact(stored.contact, next.contact) &&
    stored.published === next.published
  );
}

function sameLicense(left: ProfileDraft["license"], right: ProfileDraft["license"]): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.name === right.name &&
    left.creditCode === right.creditCode &&
    left.legalPerson === right.legalPerson &&
    left.registeredAddress === right.registeredAddress &&
    left.imageUrl === right.imageUrl
  );
}

function sameContact(left: ProfileDraft["contact"], right: ProfileDraft["contact"]): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.phone === right.phone && left.label === right.label && left.qrUrl === right.qrUrl;
}

function isJsonContentType(request: Request): boolean {
  const header = request.headers.get("content-type");
  if (header === null) {
    return false;
  }
  return header.split(";")[0]?.trim().toLowerCase() === "application/json";
}

async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const text = await request.text();
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: "请求体不是有效的 JSON。" };
  }
}
