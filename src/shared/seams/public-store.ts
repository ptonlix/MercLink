export type PublicLicense = {
  name: string;
  creditCode: string;
  legalPerson: string;
  registeredAddress: string;
  imageUrl: string;
};

export type PublicContact = {
  phone: string | null;
  label: string | null;
  qrUrl: string | null;
};

export type PublicStoreProfile = {
  displayName: string;
  summary: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  areaServed: string | null;
  address: string | null;
  license: PublicLicense | null;
  contact: PublicContact | null;
};

export type PublicFaqItem = {
  question: string;
  answer: string;
};

export type PublicStoreRead = {
  profile: PublicStoreProfile | null;
  faqs: readonly PublicFaqItem[];
};

export type PublicStoreImpl = {
  get: () => Promise<PublicStoreProfile | null>;
  faqs?: () => Promise<readonly PublicFaqItem[]>;
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

async function faqs(): Promise<readonly PublicFaqItem[]> {
  const implementation = slot().impl?.faqs;
  if (implementation === undefined) {
    return [];
  }
  return implementation();
}

async function read(): Promise<PublicStoreRead> {
  const [profile, items] = await Promise.all([get(), faqs()]);
  return { profile, faqs: items };
}

export const publicStore = {
  get,
  faqs,
  read,
  register: registerPublicStore,
  reset: resetPublicStore,
};
