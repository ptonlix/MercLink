export const maxStorefrontBytes = 32 * 1024 * 1024;

export const maxStorefrontEntries = 500;

const storefrontUploadLimit = 8;

const storefrontUploadWindowMs = 60 * 60 * 1000;

export const storefrontUploadPolicyName = "storefront-upload";

export function storefrontUploadPolicies(): {
  readonly "storefront-upload": { readonly limit: number; readonly windowMs: number };
} {
  return {
    [storefrontUploadPolicyName]: {
      limit: storefrontUploadLimit,
      windowMs: storefrontUploadWindowMs,
    },
  };
}
