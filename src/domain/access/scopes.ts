import { grantedScopes, isScope, type Scope } from "../../shared/actor";

export const merchantApprovalScopes = [
  "field:write",
  "product:write",
  "product:read",
  "order:read",
] as const satisfies readonly Scope[];

export const buyerApprovalScopes = [
  "order:write",
  "order:read",
] as const satisfies readonly Scope[];

const catalogManagement = new Set<Scope>(["field:write", "product:write"]);
const storefrontWrite = "storefront:write" satisfies Scope;

export type AuthorizationPage = "merchant" | "buyer";

export function selectAuthorizationPage(
  requested: readonly string[],
): AuthorizationPage | "invalid" {
  const known = requested.filter(isScope);
  if (known.some((scope) => catalogManagement.has(scope) || scope === storefrontWrite)) {
    return "merchant";
  }
  if (
    known.length > 0 &&
    known.every((scope) => scope === "order:write" || scope === "order:read")
  ) {
    return "buyer";
  }
  return "invalid";
}

export function fixedApprovalScopes(page: AuthorizationPage): readonly Scope[] {
  return grantedScopes(page === "merchant" ? merchantApprovalScopes : buyerApprovalScopes);
}

export function grantedApprovalScopes(
  page: AuthorizationPage,
  requested: readonly string[],
): readonly Scope[] {
  const base = fixedApprovalScopes(page);
  if (page !== "merchant" || !requested.includes(storefrontWrite)) {
    return base;
  }
  return grantedScopes([...base, storefrontWrite]);
}

export function authorizationCreatesMerchant(): false {
  return false;
}
