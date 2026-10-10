import { z } from "zod";
import { hasScope, type Actor } from "../../shared/actor";
import { apiFailure, apiSuccess } from "../../shared/errors";
import { authenticate } from "../../shared/seams/authenticate";
import {
  storefrontFail,
  storefrontOk,
  type StorefrontResult,
} from "../../domain/storefront/result";
import { activateRelease, createRelease, downloadSource, rollbackRelease } from "./release";
import { readStorefrontReset, requestStorefrontReset } from "./reset";

const confirmBody = z.object({ confirm: z.literal(true) }).strict();

export async function getStorefrontSource(request: Request): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const result = await downloadSource();
  if (!result.ok) {
    return failureResponse(result, request);
  }
  return new Response(binaryBody(result.value), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="storefront-source.zip"',
      "cache-control": "no-store",
    },
  });
}

export async function postStorefrontRelease(request: Request): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const form = await readForm(request);
  if (!form.ok) {
    return failureResponse(form, request);
  }
  const created = await createRelease({
    merchantId: gate.merchantId,
    source: form.value.source,
    staticArchive: form.value.staticArchive,
    fallback: form.value.fallback,
    authorizeBuyer: form.value.authorizeBuyer,
    authorizeMerchant: form.value.authorizeMerchant,
  });
  if (!created.ok) {
    return failureResponse(created, request);
  }
  return apiSuccess({ id: created.value.id, active: false }, { status: 201, request });
}

export async function postStorefrontActivate(
  request: Request,
  releaseId: string,
): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const body = await readConfirm(request);
  if (!body.ok) {
    return failureResponse(body, request);
  }
  const activated = await activateRelease(releaseId, body.value);
  if (!activated.ok) {
    return failureResponse(activated, request);
  }
  return apiSuccess({ id: activated.value.id, active: true }, { request });
}

export async function postStorefrontReset(request: Request): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const created = await requestStorefrontReset(gate.merchantId);
  if (!created.ok) {
    return failureResponse(created, request);
  }
  return apiSuccess(
    {
      id: created.value.id,
      status: created.value.status,
      approval_url: created.value.approvalUrl,
      executed: false,
    },
    { request },
  );
}

export async function getStorefrontReset(request: Request, id: string): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const found = await readStorefrontReset(id);
  if (!found.ok) {
    return failureResponse(found, request);
  }
  return apiSuccess(
    {
      id: found.value.id,
      status: found.value.status,
      approval_url: found.value.approvalUrl,
      executed: found.value.status === "executed",
    },
    { request },
  );
}

export async function postStorefrontRollback(request: Request): Promise<Response> {
  const gate = await storefrontGate(request);
  if (!gate.ok) {
    return gate.response;
  }
  const rolled = await rollbackRelease();
  if (!rolled.ok) {
    return failureResponse(rolled, request);
  }
  return apiSuccess({ active_release_id: rolled.value.activeId }, { request });
}

async function storefrontGate(
  request: Request,
): Promise<{ ok: true; merchantId: string } | { ok: false; response: Response }> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }
  const merchantId = merchantIdOf(auth.actor);
  if (merchantId === undefined || !hasScope(auth.actor, "storefront:write")) {
    return {
      ok: false,
      response: apiFailure("forbidden", "缺少店面权限。", { request }),
    };
  }
  return { ok: true, merchantId };
}

function merchantIdOf(actor: Actor): string | undefined {
  if (actor.type === "merchant") {
    return actor.merchantId;
  }
  if (actor.type === "script" && actor.ownerType === "merchant") {
    return actor.ownerId;
  }
  return undefined;
}

async function readForm(request: Request): Promise<
  StorefrontResult<{
    source: Uint8Array;
    staticArchive: Uint8Array;
    fallback: string | null;
    authorizeBuyer: string | null;
    authorizeMerchant: string | null;
  }>
> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return storefrontFail("validation_error", "请使用 multipart/form-data 上传源码和静态包。");
  }
  const source = form.get("source");
  const staticFile = form.get("static");
  if (!(source instanceof File) || !(staticFile instanceof File)) {
    return storefrontFail("validation_error", "请同时上传 source 和 static。");
  }
  return {
    ok: true,
    value: {
      source: new Uint8Array(await source.arrayBuffer()),
      staticArchive: new Uint8Array(await staticFile.arrayBuffer()),
      fallback: textField(form.get("fallback")),
      authorizeBuyer: textField(form.get("authorize_buyer")),
      authorizeMerchant: textField(form.get("authorize_merchant")),
    },
  };
}

async function readConfirm(request: Request): Promise<StorefrontResult<true>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return storefrontFail("validation_error", "确认激活必须带 confirm: true。");
  }
  const parsed = confirmBody.safeParse(body);
  if (!parsed.success) {
    return storefrontFail("validation_error", "确认激活必须带 confirm: true。");
  }
  return storefrontOk(parsed.data.confirm);
}

function textField(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function failureResponse(
  result: {
    error:
      "forbidden" | "not_found" | "validation_error" | "rate_limited" | "dependency_unavailable";
    message: string;
  },
  request: Request,
): Response {
  return apiFailure(result.error, result.message, { request });
}

function binaryBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
