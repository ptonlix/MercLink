import { randomBytes } from "node:crypto";
import { agentClientId } from "../../src/app-services/access/provider";
import { noticeFrom, SmokeClient, uniquePhone } from "./client";

const smokeAdminPassword = "smoke-admin-pass";
const merchantScope = "field:write product:write product:read order:read";
const buyerScope = "order:write order:read";

export type MerchantSession = {
  token: string;
};

export async function merchantAccessToken(client: SmokeClient): Promise<MerchantSession> {
  const adminPhone = process.env.ADMIN_PHONE;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPhone === undefined || adminPassword === undefined) {
    throw new Error("ADMIN_PHONE and ADMIN_PASSWORD are required to provision a smoke merchant");
  }
  const signedIn = await loginAdmin(client, adminPhone, adminPassword);
  if (!signedIn) {
    const retired = await loginAdmin(client, adminPhone, smokeAdminPassword);
    if (!retired) {
      throw new Error("admin login failed");
    }
  }
  const phone = uniquePhone();
  const initialPassword = "merchant-init-1";
  let notice = await provision(client, phone, initialPassword);
  if (notice.includes("修改")) {
    await changeAdminPassword(client, adminPassword, smokeAdminPassword);
    client.clearCookies();
    const again = await loginAdmin(client, adminPhone, smokeAdminPassword);
    if (!again) {
      throw new Error("admin login failed after password change");
    }
    notice = await provision(client, phone, initialPassword);
  }
  const merchantId = /mch_[A-Za-z0-9_-]+/.exec(notice)?.[0];
  if (merchantId === undefined) {
    throw new Error(`merchant was not provisioned: ${notice}`);
  }
  client.clearCookies();
  await submitForm(client, "/authorize/merchant/submit", {
    intent: "login",
    phone,
    password: initialPassword,
  });
  await submitForm(client, "/authorize/merchant/submit", {
    intent: "change-password",
    currentPassword: initialPassword,
    nextPassword: "merchant-next-1",
  });
  const token = await issueDeviceAccessToken(client, merchantScope);
  return { token };
}

export async function buyerAccessToken(client: SmokeClient): Promise<string> {
  const phone = uniquePhone();
  const sent = await submitForm(client, "/authorize/buyer/submit", {
    intent: "sms",
    phone,
    captchaVerifyParam: randomBytes(16).toString("base64url"),
  });
  await expectBuyerStep(sent, "未发送短信");
  const checked = await submitForm(client, "/authorize/buyer/submit", {
    intent: "check",
    phone,
    code: "123456",
  });
  await expectBuyerStep(checked, "短信已核验");
  const registered = await submitForm(client, "/authorize/buyer/submit", {
    intent: "register",
    phone,
    password: "buyer-pass-1",
  });
  await expectBuyerStep(registered, "登录成功");
  return issueDeviceAccessToken(client, buyerScope);
}

async function readJson(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    throw new Error(`${label} returned HTTP ${String(response.status)} with an empty body`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} returned HTTP ${String(response.status)} ${text.slice(0, 180)}`);
  }
}

async function expectBuyerStep(response: Response, expected: string): Promise<void> {
  const notice = noticeFrom(response);
  if (response.status === 303 && notice.includes(expected)) {
    return;
  }
  const body = await response.text();
  throw new Error(
    `buyer step failed: HTTP ${String(response.status)} ${notice || "no notice"} ${body.slice(0, 180)}`,
  );
}

async function issueDeviceAccessToken(client: SmokeClient, scope: string): Promise<string> {
  const started = await client.request("/oauth/device/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: agentClientId, scope }),
  });
  const device = (await readJson(started, "device authorization")) as {
    device_code?: string;
    verification_uri_complete?: string;
    error?: string;
  };
  if (started.status !== 200 || device.device_code === undefined || device.verification_uri_complete === undefined) {
    throw new Error(device.error ?? "device authorization failed");
  }

  let page = await client.fetchUrl(device.verification_uri_complete, { redirect: "manual" });
  let html = "";
  for (let step = 0; step < 8; step += 1) {
    if (page.status === 302 || page.status === 303) {
      const location = page.headers.get("location");
      if (location === null) {
        throw new Error("device redirect is missing location");
      }
      page = await client.fetchUrl(new URL(location, client.config.baseUrl).toString(), {
        redirect: "manual",
      });
      continue;
    }
    if (page.status !== 200) {
      throw new Error(`device approval stopped at HTTP ${String(page.status)}`);
    }
    html = await page.text();
    if (html.includes("批准成功")) {
      break;
    }
    const form = approvalForm(html, client.config.baseUrl);
    if (form === undefined) {
      throw new Error(`device form was not rendered: ${pageTitle(html)}`);
    }
    const intent = form.fields.get("intent");
    if (intent !== null && intent !== "approve") {
      throw new Error(`device approval is not signed in: ${pageTitle(html)}`);
    }
    page = await client.fetchUrl(form.action, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.fields,
    });
  }
  if (!html.includes("批准成功")) {
    throw new Error(`device approval did not finish: ${pageTitle(html)}`);
  }

  const tokenResponse = await client.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: agentClientId,
      device_code: device.device_code,
    }),
  });
  const tokens = (await readJson(tokenResponse, "device token")) as {
    access_token?: string;
    error?: string;
  };
  if (tokenResponse.status !== 200 || tokens.access_token === undefined) {
    throw new Error(tokens.error ?? "device token exchange failed");
  }
  return tokens.access_token;
}

export function approvalForm(
  html: string,
  baseUrl: string,
): { action: string; fields: URLSearchParams } | undefined {
  const forms: { action: string; fields: URLSearchParams }[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const action = attribute(match[1] ?? "", "action");
    if (action === undefined) {
      continue;
    }
    const fields = new URLSearchParams();
    for (const input of (match[2] ?? "").matchAll(/<input\b[^>]*>/gi)) {
      const tag = input[0];
      const name = attribute(tag, "name");
      const type = attribute(tag, "type") ?? "text";
      if (name === undefined || type === "submit" || type === "button") {
        continue;
      }
      fields.set(name, decodeHtml(attribute(tag, "value") ?? ""));
    }
    forms.push({
      action: new URL(decodeHtml(action), baseUrl).toString(),
      fields,
    });
  }
  return forms.find((form) => form.fields.get("intent") === "approve") ?? forms[0];
}

function pageTitle(html: string): string {
  const title = html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? "no title";
  const notice = html.match(/class="notice"[^>]*>([^<]*)/)?.[1] ?? "";
  return `${title} ${notice}`.trim();
}

function attribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i");
  const matched = pattern.exec(tag);
  return matched?.[1] ?? matched?.[2];
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function loginAdmin(client: SmokeClient, phone: string, password: string): Promise<boolean> {
  const response = await submitForm(client, "/admin/submit", {
    intent: "login",
    phone,
    password,
  });
  return response.status === 303 && !noticeFrom(response).includes("不正确");
}

async function changeAdminPassword(
  client: SmokeClient,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  await submitForm(client, "/admin/submit", {
    intent: "password",
    currentPassword,
    nextPassword,
  });
}

async function provision(client: SmokeClient, phone: string, password: string): Promise<string> {
  const response = await submitForm(client, "/admin/submit", {
    intent: "provision",
    name: "冒烟商店",
    phone,
    password,
  });
  return noticeFrom(response);
}

async function submitForm(
  client: SmokeClient,
  path: string,
  fields: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams(fields);
  return client.request(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}
