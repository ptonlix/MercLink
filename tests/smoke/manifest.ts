export const smokeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type SmokeMethod = (typeof smokeMethods)[number];

type SmokeAudience = "public" | "bearer" | "cookie" | "form";

type SmokeBodyKind = "envelope" | "text" | "json" | "html" | "bytes" | "redirect" | "empty" | "oauth";

export type SmokeRoute = {
  method: SmokeMethod;
  path: string;
  audience: SmokeAudience;
  bodyKind: SmokeBodyKind;
};

// Coverage inventory only. Skills keep using src/shared/api-routes.ts.
export const smokeManifest = [
  { method: "GET", path: "/.well-known/oauth-protected-resource", audience: "public", bodyKind: "json" },
  { method: "POST", path: "/admin/submit", audience: "form", bodyKind: "redirect" },
  { method: "GET", path: "/agent-docs/buyer-skill", audience: "public", bodyKind: "text" },
  { method: "GET", path: "/agent-docs/merchant-skill", audience: "public", bodyKind: "text" },
  { method: "GET", path: "/api/health", audience: "public", bodyKind: "json" },
  { method: "DELETE", path: "/api/v1/api-keys/{id}", audience: "cookie", bodyKind: "empty" },
  { method: "POST", path: "/api/v1/api-keys/{id}", audience: "cookie", bodyKind: "redirect" },
  { method: "GET", path: "/api/v1/api-keys", audience: "cookie", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/api-keys", audience: "cookie", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/fields/changes", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/catalogs/{id}/fields", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/fields", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/images", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/axes", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/options", audience: "public", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/publish", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/restore", audience: "bearer", bodyKind: "envelope" },
  { method: "PATCH", path: "/api/v1/catalogs/{id}/products/{product_id}", audience: "bearer", bodyKind: "envelope" },
  { method: "DELETE", path: "/api/v1/catalogs/{id}/products/{product_id}", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/unpublish", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products/{product_id}/variants", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/catalogs/{id}/products", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs/{id}/products", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/catalogs/{id}/schema", audience: "public", bodyKind: "envelope" },
  { method: "PATCH", path: "/api/v1/catalogs/{id}/variants/{variant_id}", audience: "bearer", bodyKind: "envelope" },
  { method: "DELETE", path: "/api/v1/catalogs/{id}/variants/{variant_id}", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/catalogs", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/catalogs", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/manage/orders", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/merchant/profile", audience: "bearer", bodyKind: "envelope" },
  { method: "PUT", path: "/api/v1/merchant/profile", audience: "bearer", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/orders/{id}", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/orders", audience: "bearer", bodyKind: "envelope" },
  { method: "POST", path: "/api/v1/payments/alipay/notify", audience: "public", bodyKind: "text" },
  { method: "GET", path: "/api/v1/products/{id}", audience: "public", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/products", audience: "public", bodyKind: "envelope" },
  { method: "GET", path: "/api/v1/store", audience: "public", bodyKind: "envelope" },
  { method: "GET", path: "/authorize/buyer/submit", audience: "public", bodyKind: "html" },
  { method: "POST", path: "/authorize/buyer/submit", audience: "form", bodyKind: "redirect" },
  { method: "POST", path: "/authorize/merchant/submit", audience: "form", bodyKind: "redirect" },
  { method: "POST", path: "/dev/pay/{paymentId}/confirm", audience: "public", bodyKind: "redirect" },
  { method: "GET", path: "/llms.txt", audience: "public", bodyKind: "text" },
  { method: "GET", path: "/media/{id}", audience: "public", bodyKind: "bytes" },
  { method: "GET", path: "/oauth/{...oidc}", audience: "public", bodyKind: "oauth" },
  { method: "POST", path: "/oauth/{...oidc}", audience: "public", bodyKind: "oauth" },
  { method: "PUT", path: "/oauth/{...oidc}", audience: "public", bodyKind: "oauth" },
  { method: "PATCH", path: "/oauth/{...oidc}", audience: "public", bodyKind: "oauth" },
  { method: "DELETE", path: "/oauth/{...oidc}", audience: "public", bodyKind: "oauth" },
] as const satisfies readonly SmokeRoute[];

export function smokeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}

export function bearerRoutes(): readonly SmokeRoute[] {
  return smokeManifest.filter((route) => route.audience === "bearer");
}
