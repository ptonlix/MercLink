import type Provider from "oidc-provider";
import type { Sql } from "../../db/client";
import { selectAuthorizationPage } from "../../domain/access/scopes";
import { currentPurchaseEnabled, purchaseDisabledMessage } from "../../shared/purchase-mode";
import { approveAgent } from "./grants";

export async function approveBuyerAgent(input: {
  sql: Sql;
  cookieHeader: string;
  ownerId: string;
  provider: () => Promise<Provider>;
}): Promise<{ ok: true; returnTo: string } | { ok: false; notice: string }> {
  if (!currentPurchaseEnabled()) {
    return { ok: false, notice: purchaseDisabledMessage };
  }
  const approved = await approveAgent({
    provider: await input.provider(),
    sql: input.sql,
    cookieHeader: input.cookieHeader,
    page: "buyer",
    ownerType: "buyer",
    ownerId: input.ownerId,
  });
  return { ok: true, returnTo: approved.returnTo };
}

export async function gateDeviceAuthorization(request: Request): Promise<Response | Request> {
  if (currentPurchaseEnabled() || request.method !== "POST") {
    return request;
  }
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/device/auth")) {
    return request;
  }
  const text = await request.text();
  const scope = new URLSearchParams(text).get("scope") ?? "";
  if (selectAuthorizationPage(scope.split(/\s+/)) === "buyer") {
    return Response.json(
      { error: "invalid_scope", error_description: "invalid_scope" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: text,
  });
}
