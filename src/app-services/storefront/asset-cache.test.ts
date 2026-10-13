import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { ObjectStoragePort } from "../../ports/object-storage";
import { entityTag } from "../../shared/representation";
import { bindStorefrontRuntime, resetStorefrontRuntime, type StorefrontRuntime } from "./runtime";
import { serveStorefront } from "./serve";
import type { FileRow, StorefrontStore } from "./store";

const css = new TextEncoder().encode(".card{color:#111;padding:12px}".repeat(40));
const png = Uint8Array.from({ length: 300 }, (_, index) => index);
const html = `<p>${"店铺介绍".repeat(80)}</p>`;
const cssKey = "storefront/releases/sfr_1/static/styles.css";
const pngKey = "storefront/releases/sfr_1/static/cover.png";
const htmlKey = "storefront/releases/sfr_1/static/index.html";

afterEach(() => {
  resetStorefrontRuntime();
});

describe("released asset delivery", () => {
  it("revalidates a stylesheet without reading it again and keeps HTML uncached", async () => {
    const storage = storageWith({
      [cssKey]: css,
      [pngKey]: png,
      [htmlKey]: new TextEncoder().encode(html),
    });
    bind(storage.port);

    const first = await serveStorefront("/styles.css", "https://shop.example/styles.css");
    expect(first?.status).toBe(200);
    expect(first?.headers.get("cache-control")).toBe(
      "public, max-age=600, stale-while-revalidate=86400",
    );
    expect(first?.headers.get("etag")).toBe(entityTag(cssKey));
    expect(storage.opens).toBe(1);

    const cached = await serveStorefront(
      "/styles.css",
      "https://shop.example/styles.css",
      new Request("https://shop.example/styles.css", {
        headers: { "if-none-match": first?.headers.get("etag") ?? "" },
      }),
    );
    expect(cached?.status).toBe(304);
    expect(storage.opens).toBe(1);

    const compressed = await serveStorefront(
      "/styles.css",
      "https://shop.example/styles.css",
      new Request("https://shop.example/styles.css", {
        headers: { "accept-encoding": "gzip" },
      }),
    );
    expect(compressed?.headers.get("content-encoding")).toBe("gzip");
    expect(new TextDecoder().decode(gunzipSync(new Uint8Array(await bodyOf(compressed))))).toBe(
      new TextDecoder().decode(css),
    );

    const image = await serveStorefront(
      "/cover.png",
      "https://shop.example/cover.png",
      new Request("https://shop.example/cover.png", { headers: { "accept-encoding": "gzip" } }),
    );
    expect(image?.headers.get("content-encoding")).toBeNull();
    expect(new Uint8Array(await bodyOf(image))).toEqual(png);

    const page = await serveStorefront(
      "/",
      "https://shop.example/",
      new Request("https://shop.example/", { headers: { "accept-encoding": "gzip" } }),
    );
    expect(page?.headers.get("cache-control")).toBe("no-store");
    expect(page?.headers.get("content-encoding")).toBe("gzip");
    const pageText = new TextDecoder().decode(gunzipSync(new Uint8Array(await bodyOf(page))));
    expect(pageText).toContain("店铺介绍");
    expect(pageText).toContain('rel="canonical"');

    const upper = await serveStorefront("/About.HTML", "https://shop.example/About.HTML");
    expect(upper?.headers.get("cache-control")).toBe("no-store");
    expect(upper?.headers.get("etag")).toBeNull();
  });
});

async function bodyOf(response: Response | null): Promise<ArrayBuffer> {
  if (response === null) {
    throw new Error("missing response");
  }
  return response.arrayBuffer();
}

function bind(storage: ObjectStoragePort): void {
  const files = new Map<string, FileRow>([
    ["styles.css", file("styles.css", cssKey, "text/css; charset=utf-8", css.byteLength)],
    ["cover.png", file("cover.png", pngKey, "image/png", png.byteLength)],
    ["index.html", file("index.html", htmlKey, "text/html; charset=utf-8", html.length)],
    ["About.HTML", file("About.HTML", htmlKey, "text/html; charset=utf-8", html.length)],
  ]);
  const store = {
    readPointer: () => Promise.resolve({ activeId: "sfr_1", previousId: null }),
    getRelease: () =>
      Promise.resolve({
        id: "sfr_1",
        merchantId: "mch_1",
        sourceKey: "source",
        fallback: null,
        authorizeBuyer: null,
        authorizeMerchant: null,
        createdAt: new Date(0),
      }),
    findFile: (_releaseId: string, path: string) => Promise.resolve(files.get(path) ?? null),
  } as unknown as StorefrontStore;
  bindStorefrontRuntime({
    objectStorage: storage,
    store,
    readOrderStatus: () => Promise.resolve(null),
  } as unknown as StorefrontRuntime);
}

function file(path: string, objectKey: string, contentType: string, byteSize: number): FileRow {
  return { releaseId: "sfr_1", path, objectKey, contentType, byteSize };
}

function storageWith(objects: Record<string, Uint8Array>): {
  port: ObjectStoragePort;
  opens: number;
} {
  const state = { opens: 0 };
  return {
    get opens() {
      return state.opens;
    },
    port: {
      put: () => Promise.resolve(),
      open: (key) => {
        state.opens += 1;
        const bytes = objects[key];
        return Promise.resolve(
          bytes === undefined ? null : { bytes, contentType: "application/octet-stream" },
        );
      },
      delete: () => Promise.resolve(),
      headBucket: () => Promise.resolve(),
    },
  };
}
