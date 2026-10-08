import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GET as merchantProfileRoute,
  PUT as putProfileRoute,
} from "../../app/api/v1/merchant/profile/route";
import { GET as publicStoreRoute } from "../../app/api/v1/store/route";
import { default as HomePage } from "../../app/page";
import { buyerActor, merchantActor } from "../../shared/actor";
import { registerAuthenticator, resetAuthenticator } from "../../shared/seams/authenticate";
import { resetPublicProducts } from "../../shared/seams/public-products";
import type { ProfileDraft } from "../../domain/identity/profile";
import { bindMerchantProfileStore, resetMerchantProfileStore } from "./profile-http";
import type { MerchantProfileStore, StoredProfile } from "./profile-store";

type MemoryMerchant = {
  phone: string;
  email: string | null;
  status: "active" | "disabled";
  deletedAt: Date | null;
  profile: StoredProfile | null;
};

describe("merchant profile http", () => {
  afterEach(() => {
    resetAuthenticator();
    resetMerchantProfileStore();
    resetPublicProducts();
  });

  it("returns an empty draft and does not publish the account name", async () => {
    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138000" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:read"]);

    const response = await merchantProfileRoute(authed("GET"));
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ code: 200, message: "成功", data: emptyDraft() });
    expect(JSON.stringify(body)).not.toContain("13800138000");
    expect(JSON.stringify(body)).not.toContain("mch_a");
    expect(JSON.stringify(body)).not.toContain("超管填写的账号名");
  });

  it("saves a draft that the public page and store do not show", async () => {
    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138000" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:write"]);

    const saved = await putProfileRoute(
      authed("PUT", draftBody({ display_name: "南风商店", summary: "草稿简介", published: false })),
    );
    const again = await merchantProfileRoute(authed("GET"));
    const body = await responseJson(saved);
    const read = await responseJson(again);
    const html = renderToStaticMarkup(await HomePage());
    const publicResponse = await publicStoreRoute();

    expect(saved.status).toBe(200);
    expect(body).toMatchObject({
      display_name: "南风商店",
      summary: "草稿简介",
      website_url: null,
      published: false,
    });
    expect(isRecord(body) ? body.updated_at : undefined).toEqual(expect.any(String));
    expect(read).toEqual(body);
    expect(html).not.toContain("草稿简介");
    expect(publicResponse.status).toBe(404);
    await expect(publicResponse.json()).resolves.toMatchObject({ code: 40400, data: null });
    expect(JSON.stringify(await publicStoreRoute().then((item) => item.json()))).not.toContain(
      "草稿简介",
    );
  });

  it("replaces the whole profile and keeps the same result when repeated", async () => {
    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138000" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:write"]);
    const firstBody = draftBody({
      display_name: "南风商店",
      summary: "已发布简介",
      website_url: "https://example.com",
      logo_url: "https://example.com/logo.png",
      area_served: "杭州市",
      address: "西湖区某某路 88 号",
      published: true,
    });
    const first = await putProfileRoute(authed("PUT", firstBody));
    const second = await putProfileRoute(authed("PUT", firstBody));
    expect(dataOf(await first.json())).toEqual(dataOf(await second.json()));
    expect(memory.writes).toBe(1);
    const replaced = await putProfileRoute(
      authed(
        "PUT",
        draftBody({
          display_name: "南风商店",
          summary: "换成新简介",
          website_url: null,
          published: true,
        }),
      ),
    );

    await expect(replaced.json()).resolves.toMatchObject({
      code: 200,
      data: {
        summary: "换成新简介",
        website_url: null,
        logo_url: null,
        area_served: null,
        address: null,
      },
    });
    expect(memory.writes).toBe(2);
  });

  it("rejects a buyer, a missing scope, an unknown field, and an invalid publish without writing", async () => {
    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138000", email: "secret@example.com" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:write"]);
    const published = await putProfileRoute(
      authed(
        "PUT",
        draftBody({ display_name: "南风商店", summary: "已发布简介", published: true }),
      ),
    );
    expect(published.status).toBe(200);
    const writesAfterPublish = memory.writes;

    asBuyer();
    const buyer = await putProfileRoute(authed("PUT", draftBody({ summary: "买家改写" })));
    expect(buyer.status).toBe(403);
    await expect(buyer.json()).resolves.toMatchObject({ code: 40300, data: null });

    asMerchant("mch_a", ["product:read"]);
    const missingScope = await putProfileRoute(authed("PUT", draftBody({ summary: "无权改写" })));
    expect(missingScope.status).toBe(403);
    await expect(missingScope.json()).resolves.toMatchObject({ code: 40300, data: null });
    const readable = await merchantProfileRoute(authed("GET"));
    expect(readable.status).toBe(200);
    await expect(readable.json()).resolves.toMatchObject({
      code: 200,
      data: { summary: "已发布简介" },
    });

    asMerchant("mch_a", ["product:write"]);
    const unknown = await putProfileRoute(
      authed("PUT", { ...draftBody({ summary: "带手机号字段" }), phone: "13800138000" }),
    );
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ code: 40000, data: null });

    const emptySummary = await putProfileRoute(
      authed("PUT", draftBody({ display_name: "新店名", summary: "", published: true })),
    );
    expect(emptySummary.status).toBe(400);
    await expect(emptySummary.json()).resolves.toMatchObject({ code: 40000, data: null });

    const phoneWebsite = await putProfileRoute(
      authed("PUT", draftBody({ website_url: "13800138000", published: true })),
    );
    expect(phoneWebsite.status).toBe(400);
    await expect(phoneWebsite.json()).resolves.toMatchObject({ code: 40000, data: null });

    const notJson = await putProfileRoute(
      new Request("https://merclink.example/api/v1/merchant/profile", {
        method: "PUT",
        headers: { authorization: "Bearer merchant-token", "content-type": "text/plain" },
        body: "not-json",
      }),
    );
    expect(notJson.status).toBe(400);
    await expect(notJson.json()).resolves.toMatchObject({ code: 40000, data: null });

    expect(memory.writes).toBe(writesAfterPublish);
    const stored = await merchantProfileRoute(authed("GET"));
    const storedBody = await responseJson(stored);
    expect(storedBody).toMatchObject({
      display_name: "南风商店",
      summary: "已发布简介",
      website_url: null,
      published: true,
    });
    expect(JSON.stringify(storedBody)).not.toContain("13800138000");
    expect(JSON.stringify(storedBody)).not.toContain("secret@example.com");
    expect(JSON.stringify(storedBody)).not.toContain("password");
    expect(JSON.stringify(storedBody)).not.toContain("mch_a");
    const visible = await publicStoreRoute();
    const visibleText = await visible.text();
    expect(JSON.parse(visibleText)).toMatchObject({
      code: 200,
      data: { summary: "已发布简介" },
    });
    expect(visibleText).not.toContain("13800138000");
  });

  it("returns 401 without a token and hides a disabled merchant's published profile", async () => {
    const missing = await merchantProfileRoute(
      new Request("https://merclink.example/api/v1/merchant/profile"),
    );
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({ code: 40100, data: null });

    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138000" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:write"]);
    const saved = await putProfileRoute(
      authed(
        "PUT",
        draftBody({ display_name: "南风商店", summary: "停用前简介", published: true }),
      ),
    );
    expect(saved.status).toBe(200);
    const shown = await publicStoreRoute();
    expect(shown.status).toBe(200);
    await expect(shown.json()).resolves.toMatchObject({
      code: 200,
      data: {
        display_name: "南风商店",
        summary: "停用前简介",
        website_url: null,
        logo_url: null,
        area_served: null,
        address: null,
      },
    });

    const row = memory.merchants.get("mch_a");
    if (row === undefined) {
      throw new Error("missing merchant");
    }
    row.status = "disabled";
    const hidden = await publicStoreRoute();
    expect(hidden.status).toBe(404);
    const hiddenBody: unknown = await hidden.json();
    expect(hiddenBody).toMatchObject({ code: 40400, data: null });
    expect(isRecord(hiddenBody) && typeof hiddenBody.message === "string").toBe(true);
    expect(JSON.stringify(hiddenBody)).not.toContain("停用前简介");
    expect(JSON.stringify(hiddenBody)).not.toContain("display_name");
    const html = renderToStaticMarkup(await HomePage());
    expect(html).not.toContain("停用前简介");
    expect(html).not.toContain("南风商店");
  });

  it("does not let another merchant read or replace this draft", async () => {
    const memory = memoryStore();
    memory.merchants.set("mch_a", merchant({ phone: "13800138001" }));
    memory.merchants.set("mch_b", merchant({ phone: "13800138002" }));
    useStore(memory.store);
    asMerchant("mch_a", ["product:write"]);
    await putProfileRoute(authed("PUT", draftBody({ summary: "甲的草稿" })));

    asMerchant("mch_b", ["product:write"]);
    const other = await merchantProfileRoute(authed("GET"));
    await expect(other.json()).resolves.toMatchObject({ code: 200, data: emptyDraft() });
    await putProfileRoute(authed("PUT", draftBody({ summary: "乙的草稿" })));
    asMerchant("mch_a", ["product:read"]);
    await expect(merchantProfileRoute(authed("GET")).then(responseJson)).resolves.toMatchObject({
      summary: "甲的草稿",
    });
  });

  it("is not a public merchant directory", () => {
    expect(existsSync("src/app/merchants")).toBe(false);
    expect(existsSync("src/app/merchants/[id]/page.tsx")).toBe(false);
  });
});

async function responseJson(response: Response): Promise<unknown> {
  return dataOf(JSON.parse(await response.text()));
}

function dataOf(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "data" in value) {
    return value.data;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function useStore(store: MerchantProfileStore): void {
  bindMerchantProfileStore(store);
}

function asMerchant(merchantId: string, granted: readonly string[]): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: merchantActor({ merchantId, grantId: "grn_m", scopes: granted }),
  }));
}

function asBuyer(): void {
  registerAuthenticator(() => ({
    ok: true,
    actor: buyerActor({ buyerId: "byr_1", grantId: "grn_b", scopes: ["order:write"] }),
  }));
}

function authed(method: "GET" | "PUT", body?: unknown): Request {
  return new Request("https://merclink.example/api/v1/merchant/profile", {
    method,
    headers: {
      authorization: "Bearer merchant-token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function draftBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    display_name: "示例商店",
    summary: "一段虚构简介。",
    website_url: null,
    logo_url: null,
    area_served: null,
    address: null,
    published: false,
    ...overrides,
  };
}

function emptyDraft(): Record<string, unknown> {
  return {
    display_name: "",
    summary: "",
    website_url: null,
    logo_url: null,
    area_served: null,
    address: null,
    published: false,
    updated_at: null,
  };
}

function merchant(input: { phone: string; email?: string | null }): MemoryMerchant {
  return {
    phone: input.phone,
    email: input.email ?? null,
    status: "active",
    deletedAt: null,
    profile: null,
  };
}

function memoryStore(): {
  store: MerchantProfileStore;
  merchants: Map<string, MemoryMerchant>;
  writes: number;
} {
  const merchants = new Map<string, MemoryMerchant>();
  const state = { writes: 0 };
  const store: MerchantProfileStore = {
    readOwn(merchantId) {
      return Promise.resolve(merchants.get(merchantId)?.profile ?? null);
    },
    replace(merchantId, profile: ProfileDraft) {
      const current = merchants.get(merchantId);
      if (current === undefined) {
        return Promise.reject(new Error("missing merchant"));
      }
      state.writes += 1;
      const saved: StoredProfile = { ...profile, updatedAt: new Date() };
      current.profile = saved;
      return Promise.resolve(saved);
    },
    readPublished() {
      const published = [...merchants.values()]
        .filter(
          (item) =>
            item.profile?.published === true && item.status === "active" && item.deletedAt === null,
        )
        .sort((left, right) => {
          const leftTime = left.profile?.updatedAt.getTime() ?? 0;
          const rightTime = right.profile?.updatedAt.getTime() ?? 0;
          return rightTime - leftTime;
        });
      const top = published[0]?.profile ?? null;
      if (top === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        displayName: top.displayName,
        summary: top.summary,
        websiteUrl: top.websiteUrl,
        logoUrl: top.logoUrl,
        areaServed: top.areaServed,
        address: top.address,
      });
    },
    secrets(merchantId) {
      const current = merchants.get(merchantId);
      if (current === undefined || current.deletedAt !== null) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ phone: current.phone, email: current.email });
    },
  };
  return {
    store,
    merchants,
    get writes() {
      return state.writes;
    },
  };
}
