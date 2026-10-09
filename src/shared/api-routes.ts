export const apiAudiences = ["buyer", "merchant", "storefront"] as const;

export type ApiAudience = (typeof apiAudiences)[number];

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRoute = {
  method: ApiMethod;
  path: string;
  audiences: readonly ApiAudience[];
};

const buyer = ["buyer"] as const satisfies readonly ApiAudience[];
const merchant = ["merchant"] as const satisfies readonly ApiAudience[];
const buyerAndMerchant = ["buyer", "merchant"] as const satisfies readonly ApiAudience[];
const storefront = ["storefront"] as const satisfies readonly ApiAudience[];

// Sole path list. Skill tests read this file and must not invent a second registry.
export const apiRoutes = [
  { method: "GET", path: "/api/v1/products", audiences: buyer },
  { method: "GET", path: "/api/v1/products/{id}", audiences: buyer },
  { method: "GET", path: "/api/v1/catalogs/{id}/schema", audiences: buyerAndMerchant },
  { method: "POST", path: "/api/v1/orders", audiences: buyer },
  { method: "GET", path: "/api/v1/orders/{id}", audiences: buyer },
  { method: "GET", path: "/api/v1/catalogs", audiences: merchant },
  { method: "POST", path: "/api/v1/catalogs", audiences: merchant },
  { method: "GET", path: "/api/v1/catalogs/{id}/fields", audiences: merchant },
  { method: "POST", path: "/api/v1/catalogs/{id}/fields", audiences: merchant },
  { method: "POST", path: "/api/v1/catalogs/{id}/fields/changes", audiences: merchant },
  { method: "GET", path: "/api/v1/catalogs/{id}/products", audiences: merchant },
  { method: "POST", path: "/api/v1/catalogs/{id}/products", audiences: merchant },
  { method: "POST", path: "/api/v1/catalogs/{id}/images", audiences: merchant },
  {
    method: "PATCH",
    path: "/api/v1/catalogs/{id}/products/{product_id}",
    audiences: merchant,
  },
  {
    method: "POST",
    path: "/api/v1/catalogs/{id}/products/{product_id}/publish",
    audiences: merchant,
  },
  {
    method: "POST",
    path: "/api/v1/catalogs/{id}/products/{product_id}/unpublish",
    audiences: merchant,
  },
  {
    method: "DELETE",
    path: "/api/v1/catalogs/{id}/products/{product_id}",
    audiences: merchant,
  },
  {
    method: "POST",
    path: "/api/v1/catalogs/{id}/products/{product_id}/restore",
    audiences: merchant,
  },
  {
    method: "POST",
    path: "/api/v1/catalogs/{id}/products/{product_id}/axes",
    audiences: merchant,
  },
  {
    method: "POST",
    path: "/api/v1/catalogs/{id}/products/{product_id}/variants",
    audiences: merchant,
  },
  { method: "PATCH", path: "/api/v1/catalogs/{id}/variants/{variant_id}", audiences: merchant },
  { method: "DELETE", path: "/api/v1/catalogs/{id}/variants/{variant_id}", audiences: merchant },
  { method: "GET", path: "/api/v1/manage/orders", audiences: merchant },
  {
    method: "POST",
    path: "/api/v1/manage/payments/{paymentId}/unapplied-receipt",
    audiences: merchant,
  },
  // Profile writes reuse product:write. Do not add a profile scope.
  { method: "GET", path: "/api/v1/merchant/profile", audiences: merchant },
  { method: "PUT", path: "/api/v1/merchant/profile", audiences: merchant },
  // Public read. Listed so the merchant skill documents the same path.
  { method: "GET", path: "/api/v1/store", audiences: merchant },
  { method: "POST", path: "/api/v1/payments/alipay/notify", audiences: [] },
  { method: "GET", path: "/api/v1/payments/easypay/notify", audiences: [] },
  { method: "POST", path: "/api/v1/payments/easypay/notify", audiences: [] },
  { method: "GET", path: "/.well-known/oauth-protected-resource", audiences: [] },
  { method: "GET", path: "/api/v1/storefront/source", audiences: storefront },
  { method: "POST", path: "/api/v1/storefront/releases", audiences: storefront },
  {
    method: "POST",
    path: "/api/v1/storefront/releases/{id}/activate",
    audiences: storefront,
  },
  { method: "POST", path: "/api/v1/storefront/rollback", audiences: storefront },
] as const satisfies readonly ApiRoute[];

export function routesFor(audience: ApiAudience): readonly ApiRoute[] {
  return apiRoutes.filter((route) => {
    const audiences: readonly string[] = route.audiences;
    return audiences.includes(audience);
  });
}
