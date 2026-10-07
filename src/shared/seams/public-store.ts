export type PublicStoreProfile = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
};

export type PublicStoreImpl = {
  get: () => Promise<PublicStoreProfile | null>;
};

let implementation: PublicStoreImpl | undefined;

export function registerPublicStore(impl: PublicStoreImpl): void {
  implementation = impl;
}

export function resetPublicStore(): void {
  implementation = undefined;
}

async function get(): Promise<PublicStoreProfile | null> {
  if (implementation === undefined) {
    return null;
  }
  return implementation.get();
}

export const publicStore = {
  get,
  register: registerPublicStore,
  reset: resetPublicStore,
};
