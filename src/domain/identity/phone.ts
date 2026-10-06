const mainlandMobile = /^1\d{10}$/;

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isLoginPhone(value: string): boolean {
  return mainlandMobile.test(normalizePhone(value));
}
