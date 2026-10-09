import { placeOrder } from "../../../../app-services/commerce/place-order";
import { commerceRuntime } from "../../../../app-services/commerce/runtime";
import { errorResponse, graphJson } from "../../../../app-services/commerce/view";
import { apiSuccess } from "../../../../shared/errors";
import { runOnce } from "../../../../jobs/close-expired-orders";
import { authenticate } from "../../../../shared/seams/authenticate";

function clientConnectionAddress(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (real.length > 0) {
    return acceptedIp(real);
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded === null) {
    return null;
  }
  const last = forwarded.split(",").at(-1)?.trim() ?? "";
  return acceptedIp(last);
}

function acceptedIp(value: string): string | null {
  if (value.length === 0 || value.length > 64 || !looksLikeIp(value)) {
    return null;
  }
  return value;
}

function looksLikeIp(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.includes(":::")) {
    return false;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return false;
  }
  if (halves.length === 2) {
    const leftHalf = halves[0] ?? "";
    const rightHalf = halves[1] ?? "";
    const left = leftHalf === "" ? [] : leftHalf.split(":");
    const right = rightHalf === "" ? [] : rightHalf.split(":");
    if (left.length + right.length >= 8) {
      return false;
    }
    return [...left, ...right].every(isIpv6Group);
  }
  const groups = value.split(":");
  return groups.length === 8 && groups.every(isIpv6Group);
}

function isIpv6Group(group: string): boolean {
  return /^[0-9a-fA-F]{1,4}$/.test(group);
}

function keepScannerRegistered(): void {
  if (process.env.MERCLINK_RUN_EXPIRY === "1") {
    void runOnce();
  }
}

export async function POST(request: Request): Promise<Response> {
  keepScannerRegistered();
  const auth = await authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("validation_error", "请求无效。", request);
  }
  const result = await placeOrder({
    actor: auth.actor,
    body,
    runtime: commerceRuntime(),
    clientAddress: clientConnectionAddress(request),
  });
  if (!result.ok) {
    return errorResponse(result.error, result.message, request);
  }
  return apiSuccess(graphJson(result.graph, result.action), { status: 201, request });
}
