import { getDatabase, type Sql } from "../../db/client";
import {
  canWriteProfile,
  merchantOwnerId,
  parseProfileBody,
  type ProfileDraft,
} from "../../domain/identity/profile";
import { apiError } from "../../shared/errors";
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
    return apiError("forbidden", "需要商家权限。", 403);
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return apiError("forbidden", "需要商家权限。", 403);
  }
  const row = await store.readOwn(merchantId);
  return Response.json(merchantProfileJson(row));
}

export async function putMerchantProfile(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  const merchantId = merchantOwnerId(auth.actor);
  if (merchantId === undefined) {
    return apiError("forbidden", "需要商家权限。", 403);
  }
  if (!canWriteProfile(auth.actor)) {
    return apiError("forbidden", "缺少所需权限。", 403);
  }
  if (!isJsonContentType(request)) {
    return apiError("validation_error", "请求体必须是 application/json。", 400);
  }
  const parsedBody = await readJson(request);
  if (!parsedBody.ok) {
    return apiError("validation_error", parsedBody.message, 400);
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return apiError("forbidden", "需要商家权限。", 403);
  }
  const parsed = parseProfileBody(parsedBody.value, secrets);
  if (!parsed.ok) {
    return apiError(parsed.error, parsed.message, 400);
  }
  const current = await store.readOwn(merchantId);
  const saved =
    current !== null && sameProfile(current, parsed.value)
      ? current
      : await store.replace(merchantId, parsed.value);
  return Response.json(merchantProfileJson(saved));
}

export async function getPublicStore(): Promise<Response> {
  ensureStore();
  const store = await publicStore.get();
  if (store === null) {
    return apiError("not_found", "没有已发布的店铺介绍。", 404);
  }
  return Response.json(publicStoreJson(store));
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
} {
  return {
    display_name: store.displayName,
    summary: store.summary,
    website_url: store.websiteUrl,
    logo_url: store.logoUrl,
    area_served: store.areaServed,
    address: store.address,
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
    stored.published === next.published
  );
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
