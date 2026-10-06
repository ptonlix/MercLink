import { anonymousActor, type Actor } from "../../shared/actor";

export function isPublicProductRead(method: string, path: string): boolean {
  if (method !== "GET") {
    return false;
  }
  return path === "/api/v1/products" || /^\/api\/v1\/products\/[^/]+$/.test(path);
}

export function isOrderPlacement(method: string, path: string): boolean {
  return method === "POST" && path === "/api/v1/orders";
}

export function isCatalogMutation(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD") {
    return false;
  }
  return path === "/api/v1/catalogs" || path.startsWith("/api/v1/catalogs/");
}

export type RoleDecision =
  { ok: true } | { ok: false; status: 403; error: "forbidden"; message: string };

function merchantSide(actor: Actor): boolean {
  if (actor.type === "merchant") {
    return true;
  }
  return actor.type === "script" && actor.ownerType === "merchant";
}

function buyerSide(actor: Actor): boolean {
  if (actor.type === "buyer") {
    return true;
  }
  return actor.type === "script" && actor.ownerType === "buyer";
}

export function roleDecision(actor: Actor, method: string, path: string): RoleDecision {
  if (actor.type === "anonymous") {
    return { ok: true };
  }
  if (isOrderPlacement(method, path) && merchantSide(actor)) {
    return { ok: false, status: 403, error: "forbidden", message: "无权下单。" };
  }
  if (isCatalogMutation(method, path) && buyerSide(actor)) {
    return { ok: false, status: 403, error: "forbidden", message: "无权修改目录。" };
  }
  return { ok: true };
}

export function anonymousProductSearch(): Actor {
  return anonymousActor();
}
