import { z } from "zod";
import { getDatabase, type Sql } from "../../db/client";
import { canWriteProfile, merchantOwnerId } from "../../domain/identity/profile";
import { parseFaqBody, type FaqScope } from "../../domain/identity/faqs";
import { apiFailure, apiSuccess } from "../../shared/errors";
import { authenticate } from "../../shared/seams/authenticate";
import { bindPublicFaqRead } from "./profile-http";
import { createSqlFaqStore, type MerchantFaqStore, type StoredFaqSet } from "./faq-store";

const faqItemSchema = z.strictObject({
  question: z.string(),
  answer: z.string(),
});

const faqBodySchema = z.strictObject({
  published: z.boolean(),
  items: z.array(faqItemSchema),
});

let boundStore: MerchantFaqStore | undefined;

export function bindMerchantFaqStore(store: MerchantFaqStore | undefined): void {
  boundStore = store;
  bindPublicFaqRead(store === undefined ? undefined : () => store.readPublicStore());
}

export function resetMerchantFaqStore(): void {
  bindMerchantFaqStore(undefined);
}

export function registerMerchantFaqs(sql: Sql): void {
  bindMerchantFaqStore(createSqlFaqStore(sql));
}

export async function getMerchantFaqs(request: Request): Promise<Response> {
  const actor = await merchantActor(request);
  if (!actor.ok) {
    return actor.response;
  }
  const row = await actor.store.readStore(actor.merchantId);
  return apiSuccess(faqJson(row), { request });
}

export async function putMerchantFaqs(request: Request): Promise<Response> {
  const actor = await merchantWriter(request);
  if (!actor.ok) {
    return actor.response;
  }
  const parsed = await parseRequest(request, "store", actor.secrets);
  if (!parsed.ok) {
    return apiFailure("validation_error", parsed.message, { request });
  }
  const saved = await actor.store.replaceStore(actor.merchantId, parsed.value);
  return apiSuccess(faqJson(saved), { request });
}

export async function getProductFaqs(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  const actor = await merchantActor(request);
  if (!actor.ok) {
    return actor.response;
  }
  const row = await actor.store.readProduct(actor.merchantId, catalogId, productId);
  if (!row.found) {
    return apiFailure("not_found", "没有找到商品。", { request });
  }
  return apiSuccess(faqJson(row.set), { request });
}

export async function putProductFaqs(
  request: Request,
  catalogId: string,
  productId: string,
): Promise<Response> {
  const actor = await merchantWriter(request);
  if (!actor.ok) {
    return actor.response;
  }
  const current = await actor.store.readProduct(actor.merchantId, catalogId, productId);
  if (!current.found) {
    return apiFailure("not_found", "没有找到商品。", { request });
  }
  const parsed = await parseRequest(request, "product", actor.secrets);
  if (!parsed.ok) {
    return apiFailure("validation_error", parsed.message, { request });
  }
  const saved = await actor.store.replaceProduct(
    actor.merchantId,
    catalogId,
    productId,
    parsed.value,
  );
  if (!saved.found || saved.set === null) {
    return apiFailure("not_found", "没有找到商品。", { request });
  }
  return apiSuccess(faqJson(saved.set), { request });
}

function faqJson(row: StoredFaqSet | null): {
  published: boolean;
  items: readonly { question: string; answer: string }[];
  updated_at: string | null;
} {
  if (row === null) {
    return { published: false, items: [], updated_at: null };
  }
  return {
    published: row.published,
    items: row.items.map((item) => ({ question: item.question, answer: item.answer })),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function merchantActor(
  request: Request,
): Promise<
  { ok: true; merchantId: string; store: MerchantFaqStore } | { ok: false; response: Response }
> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }
  const merchantId = merchantOwnerId(auth.actor);
  if (merchantId === undefined) {
    return { ok: false, response: apiFailure("forbidden", "需要商家权限。", { request }) };
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return { ok: false, response: apiFailure("forbidden", "需要商家权限。", { request }) };
  }
  return { ok: true, merchantId, store };
}

async function merchantWriter(request: Request): Promise<
  | {
      ok: true;
      merchantId: string;
      store: MerchantFaqStore;
      secrets: { phone: string; email: string | null };
    }
  | { ok: false; response: Response }
> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }
  const merchantId = merchantOwnerId(auth.actor);
  if (merchantId === undefined) {
    return { ok: false, response: apiFailure("forbidden", "需要商家权限。", { request }) };
  }
  if (!canWriteProfile(auth.actor)) {
    return { ok: false, response: apiFailure("forbidden", "缺少所需权限。", { request }) };
  }
  const store = ensureStore();
  const secrets = await store.secrets(merchantId);
  if (secrets === null) {
    return { ok: false, response: apiFailure("forbidden", "需要商家权限。", { request }) };
  }
  return { ok: true, merchantId, store, secrets };
}

async function parseRequest(
  request: Request,
  scope: FaqScope,
  secrets: { phone: string; email: string | null },
): Promise<
  | {
      ok: true;
      value: { published: boolean; items: readonly { question: string; answer: string }[] };
    }
  | { ok: false; message: string }
> {
  if (!isJsonContentType(request)) {
    return { ok: false, message: "请求体必须是 application/json。" };
  }
  const body = await readJson(request);
  if (!body.ok) {
    return body;
  }
  const typed = faqBodySchema.safeParse(body.value);
  if (!typed.success) {
    return { ok: false, message: zodFaqMessage(typed.error) };
  }
  const parsed = parseFaqBody(typed.data, scope, secrets);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  return { ok: true, value: parsed.value };
}

function zodFaqMessage(error: z.ZodError): string {
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      return "不能提交未声明的字段。";
    }
  }
  for (const issue of error.issues) {
    if (issue.code === "invalid_type") {
      const received = "received" in issue ? issue.received : undefined;
      if (received === "undefined") {
        return "请求缺少必填字段。";
      }
      return "字段类型不正确。";
    }
  }
  return "字段类型不正确。";
}

function ensureStore(): MerchantFaqStore {
  if (boundStore !== undefined) {
    return boundStore;
  }
  const store = createSqlFaqStore(getDatabase().sql);
  bindMerchantFaqStore(store);
  return store;
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
