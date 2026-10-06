import { hasScope, type Actor, type Scope } from "../../shared/actor";
import { catalogFail, catalogOk, type CatalogResult } from "./result";

function merchantIdOf(actor: Actor): string | undefined {
  if (actor.type === "merchant") {
    return actor.merchantId;
  }
  if (actor.type === "script" && actor.ownerType === "merchant") {
    return actor.ownerId;
  }
  return undefined;
}

export function requireMerchantScope(
  actor: Actor,
  scope: Scope,
): CatalogResult<{ merchantId: string }> {
  const merchantId = merchantIdOf(actor);
  if (merchantId === undefined) {
    return catalogFail("forbidden", "需要商家权限。");
  }
  if (!hasScope(actor, scope)) {
    return catalogFail("forbidden", "缺少所需权限。");
  }
  return catalogOk({ merchantId });
}

export function canReadSchema(actor: Actor | undefined, merchantId: string): boolean {
  if (actor === undefined || actor.type === "anonymous" || actor.type === "buyer") {
    return true;
  }
  if (actor.type === "script" && actor.ownerType === "buyer") {
    return true;
  }
  return merchantIdOf(actor) === merchantId;
}
