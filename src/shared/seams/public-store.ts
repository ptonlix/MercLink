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

const slotKey = Symbol.for("merclink.publicStore");

type StoreSlot = { impl?: PublicStoreImpl };

function slot(): StoreSlot {
  const globalSlot = globalThis as typeof globalThis & { [slotKey]?: StoreSlot };
  globalSlot[slotKey] ??= {};
  return globalSlot[slotKey];
}

export function registerPublicStore(impl: PublicStoreImpl): void {
  slot().impl = impl;
}

export function resetPublicStore(): void {
  slot().impl = undefined;
}

async function get(): Promise<PublicStoreProfile | null> {
  const implementation = slot().impl;
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
