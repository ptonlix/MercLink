import { createHash, timingSafeEqual } from "node:crypto";

const notifyFields = new Set([
  "pid",
  "trade_no",
  "out_trade_no",
  "type",
  "name",
  "money",
  "trade_status",
  "param",
  "sign",
  "sign_type",
]);

export function easyPaySign(params: Readonly<Record<string, string>>, key: string): string {
  const joined = Object.entries(params)
    .filter(([name, value]) => name !== "sign" && name !== "sign_type" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return createHash("md5").update(`${joined}${key}`).digest("hex");
}

export function signaturesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function yuanFromMinor(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }
  const whole = Math.trunc(amount / 100);
  const fraction = String(Math.abs(amount % 100)).padStart(2, "0");
  return `${String(whole)}.${fraction}`;
}

export function parseNotifyParams(body: string): Record<string, string> | null {
  const params = new URLSearchParams(body);
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (!notifyFields.has(key) || Object.prototype.hasOwnProperty.call(record, key)) {
      return null;
    }
    record[key] = value;
  }
  return record;
}

export function isAbsoluteHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://")) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isImageUrl(value: string): boolean {
  try {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function payableHttpsUrl(value: string | null): string | null {
  if (value === null || !isAbsoluteHttpsUrl(value) || isImageUrl(value)) {
    return null;
  }
  return value;
}
