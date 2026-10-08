import type Provider from "oidc-provider";
import type { Sql } from "../../src/db/client";
import { approveAgent } from "../../src/app-services/access/grants";
import { agentClientId } from "../../src/app-services/access/provider";

export async function issueDeviceTokens(input: {
  origin: string;
  provider: Provider;
  sql: Sql;
  ownerId: string;
  ownerType: "merchant" | "buyer";
  scope: string;
}): Promise<{ access_token: string; refresh_token: string; expires_in: number; grantId: string }> {
  const started = await fetch(`${input.origin}/oauth/device/auth`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: agentClientId, scope: input.scope }),
  });
  const device = (await started.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri_complete?: string;
    error?: string;
  };
  if (
    started.status !== 200 ||
    device.device_code === undefined ||
    device.user_code === undefined
  ) {
    throw new Error(device.error ?? "device authorization failed");
  }

  let cookies = "";
  let page = await fetch(device.verification_uri_complete ?? "", { redirect: "manual" });
  cookies = mergeCookies(cookies, page);
  for (let step = 0; step < 4 && page.status === 200; step += 1) {
    const submitted = await submitForm(page, cookies);
    cookies = submitted.cookies;
    page = submitted.response;
  }
  if (page.status !== 303) {
    throw new Error("device confirmation did not reach authorization");
  }

  const approved = await approveAgent({
    provider: input.provider,
    sql: input.sql,
    cookieHeader: cookies,
    page: input.ownerType,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
  });
  const finished = await fetch(absoluteUrl(input.origin, approved.returnTo), {
    redirect: "manual",
    headers: { cookie: cookies },
  });
  if (finished.status >= 400) {
    throw new Error("device approval did not finish");
  }

  const tokenResponse = await fetch(`${input.origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: agentClientId,
      device_code: device.device_code,
    }),
  });
  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (
    tokenResponse.status !== 200 ||
    tokens.access_token === undefined ||
    tokens.refresh_token === undefined ||
    tokens.expires_in === undefined
  ) {
    throw new Error(tokens.error ?? "device token exchange failed");
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    grantId: approved.grantId,
  };
}

async function submitForm(
  page: Response,
  cookies: string,
  extra: Record<string, string> = {},
): Promise<{ response: Response; cookies: string }> {
  const html = await page.text();
  const action = html.match(/<form\b[^>]*\baction="([^"]+)"/)?.[1];
  if (action === undefined) {
    throw new Error(`device form was not rendered: ${page.status} ${html.slice(0, 180)}`);
  }
  const fields = new URLSearchParams(extra);
  for (const match of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined && !fields.has(name)) {
      fields.set(name, decodeHtml(value));
    }
  }
  const response = await fetch(action, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookies,
    },
    body: fields,
  });
  return { response, cookies: mergeCookies(cookies, response) };
}

function mergeCookies(existing: string, response: Response): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator > 0) {
      jar.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
    }
  }
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0) {
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absoluteUrl(origin: string, location: string): string {
  return new URL(location, origin).toString();
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
