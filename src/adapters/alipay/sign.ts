import { createSign, createVerify } from "node:crypto";

export const alipayGateway = "https://openapi.alipay.com/gateway.do";

export const alipayMethods = {
  create: "alipay.trade.page.pay",
  query: "alipay.trade.query",
  close: "alipay.trade.close",
} as const;

const productCode = "FAST_INSTANT_TRADE_PAY";

export function signedContent(
  params: Readonly<Record<string, string>>,
  options: { exclude: readonly string[]; skipEmpty: boolean },
): string {
  const excluded = new Set(options.exclude);
  return Object.keys(params)
    .filter((key) => {
      if (excluded.has(key)) {
        return false;
      }
      const value = params[key];
      return value !== undefined && (!options.skipEmpty || value !== "");
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((key) => `${key}=${params[key] ?? ""}`)
    .join("&");
}

function alipayTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}:${read("second")}`;
}

function yuanFromMinor(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }
  const whole = Math.trunc(amount / 100);
  const fraction = String(Math.abs(amount % 100)).padStart(2, "0");
  return `${String(whole)}.${fraction}`;
}

function sanitizeSubject(subject: string): string {
  const cleaned = subject.replace(/[/=&]/g, "").replace(/\s+/g, " ").trim();
  const limited = cleaned.slice(0, 256);
  return limited.length > 0 ? limited : "order";
}

function normalizePrivateKey(value: string): string {
  return normalizePem(value, "PRIVATE KEY");
}

function normalizePublicKey(value: string): string {
  return normalizePem(value, "PUBLIC KEY");
}

function normalizePem(value: string, label: string): string {
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("BEGIN")) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

export function signRsa2(content: string, privateKey: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(normalizePrivateKey(privateKey), "base64");
}

export function verifyRsa2(content: string, signature: string, publicKey: string): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(content, "utf8");
    verifier.end();
    return verifier.verify(normalizePublicKey(publicKey), signature, "base64");
  } catch {
    return false;
  }
}

export function pagePayBizContent(input: {
  paymentId: string;
  amount: number;
  subject: string;
}): string | null {
  const totalAmount = yuanFromMinor(input.amount);
  if (totalAmount === null) {
    return null;
  }
  return JSON.stringify({
    out_trade_no: input.paymentId,
    total_amount: totalAmount,
    subject: sanitizeSubject(input.subject),
    product_code: productCode,
  });
}

export function buildSignedParams(input: {
  appId: string;
  method: string;
  bizContent: string;
  notifyUrl?: string;
  privateKey: string;
  now: Date;
}): Record<string, string> {
  const params: Record<string, string> = {
    app_id: input.appId,
    method: input.method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(input.now),
    version: "1.0",
    biz_content: input.bizContent,
  };
  if (input.notifyUrl !== undefined && input.notifyUrl !== "") {
    params.notify_url = input.notifyUrl;
  }
  params.sign = signRsa2(
    signedContent(params, { exclude: ["sign"], skipEmpty: true }),
    input.privateKey,
  );
  return params;
}

export function toFormBody(params: Readonly<Record<string, string>>): string {
  return Object.keys(params)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] ?? "")}`)
    .join("&");
}

export function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    record[key] = value;
  }
  return record;
}

export function extractJsonNode(raw: string, nodeName: string): string | null {
  const marker = `"${nodeName}"`;
  const markerAt = raw.indexOf(marker);
  if (markerAt < 0) {
    return null;
  }
  const start = raw.indexOf("{", markerAt + marker.length);
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === undefined) {
      return null;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }
  return null;
}

export function extractResponseSign(raw: string): string | null {
  const match = /"sign"\s*:\s*"([^"]*)"/.exec(raw);
  return match?.[1] ?? null;
}
