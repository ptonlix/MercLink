import { randomBytes } from "node:crypto";
import { readSmokeConfig, type SmokeConfig } from "./config";

export type Envelope = {
  code: number;
  message: string;
  data: unknown;
  timestamp: number;
  request_id: string;
};

export class SmokeClient {
  readonly config: SmokeConfig;
  private readonly cookies = new Map<string, string>();

  constructor() {
    this.config = readSmokeConfig();
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchUrl(new URL(path, this.config.baseUrl).toString(), init);
  }

  async fetchUrl(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0 && !headers.has("cookie")) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
    });
    this.storeCookies(response);
    return response;
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private storeCookies(response: Response): void {
    const lines =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const line of lines) {
      const [pair] = line.split(";");
      const eq = pair?.indexOf("=") ?? -1;
      if (pair === undefined || eq <= 0) {
        continue;
      }
      const name = pair.slice(0, eq);
      if (line.includes("Max-Age=0")) {
        this.cookies.delete(name);
        continue;
      }
      this.cookies.set(name, decodeURIComponent(pair.slice(eq + 1)));
    }
  }
}

export function examplePath(path: string): string {
  return path
    .replaceAll("{id}", "cat_missing")
    .replaceAll("{product_id}", "prd_missing")
    .replaceAll("{variant_id}", "var_missing")
    .replaceAll("{paymentId}", "pay_missing")
    .replaceAll("{...oidc}", "token");
}

export async function readEnvelope(response: Response): Promise<Envelope> {
  const text = await response.text();
  if (text.trim() === "") {
    throw new Error(`expected envelope, got HTTP ${String(response.status)} with an empty body`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`expected envelope, got HTTP ${String(response.status)} ${text.slice(0, 180)}`);
  }
  if (!isEnvelope(body)) {
    throw new Error(`expected envelope, got HTTP ${String(response.status)} ${JSON.stringify(body)}`);
  }
  if (response.headers.get("x-request-id") !== body.request_id) {
    throw new Error("X-Request-Id does not match body request_id");
  }
  if (!body.request_id.startsWith("req_")) {
    throw new Error("request_id must use the req_ prefix");
  }
  if (!Number.isFinite(body.timestamp)) {
    throw new Error("timestamp must be a number");
  }
  return body;
}

export function assertSuccess(body: Envelope, status: number): void {
  if (status !== 200 && status !== 201) {
    throw new Error(`expected HTTP 200 or 201, got ${String(status)}`);
  }
  if (body.code !== 200 || body.message !== "成功" || body.data === null) {
    throw new Error(`expected success envelope, got ${JSON.stringify(body)}`);
  }
}

export function assertFailure(body: Envelope, status: number, code: number): void {
  if (status === 200 || body.code !== code || body.data !== null) {
    throw new Error(`expected HTTP ${String(status)} code ${String(code)}, got ${JSON.stringify(body)}`);
  }
}

export function assertDevStubs(): void {
  if (process.env.SMOKE_DEV_STUBS !== "1") {
    throw new Error("SMOKE_DEV_STUBS=1 is required before payment, SMS, or captcha flows");
  }
}

export function uniquePhone(): string {
  const digits = randomBytes(4).readUInt32BE(0) % 100_000_000;
  return `139${digits.toString().padStart(8, "0")}`;
}

export function noticeFrom(response: Response): string {
  const location = response.headers.get("location") ?? "";
  const query = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  return new URLSearchParams(query).get("notice") ?? "";
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "number" &&
    typeof record.message === "string" &&
    "data" in record &&
    typeof record.timestamp === "number" &&
    typeof record.request_id === "string" &&
    !("error" in record) &&
    !("pageNum" in record)
  );
}
