import { describe, expect, it } from "vitest";
import { parseCover } from "./catalogs";
import { detectImage, maxImageBytes, mediaImageId, mediaUrl } from "./images";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("image signatures", () => {
  it("accepts JPEG, PNG, and WebP and rejects SVG, empty, and oversize files", () => {
    expect(detectImage(jpeg)).toEqual({
      ok: true,
      value: { contentType: "image/jpeg", byteSize: jpeg.byteLength },
    });
    expect(detectImage(png)).toEqual({
      ok: true,
      value: { contentType: "image/png", byteSize: png.byteLength },
    });
    expect(detectImage(webp)).toEqual({
      ok: true,
      value: { contentType: "image/webp", byteSize: webp.byteLength },
    });

    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(detectImage(svg)).toMatchObject({ ok: false, error: "validation_error" });
    expect(detectImage(new Uint8Array())).toMatchObject({ ok: false, error: "validation_error" });
    const oversize = new Uint8Array(maxImageBytes + 1);
    oversize.set(jpeg);
    expect(detectImage(oversize)).toMatchObject({ ok: false, error: "validation_error" });
    expect(detectImage(new Uint8Array(maxImageBytes))).toMatchObject({ ok: false });
  });
});

describe("cover urls", () => {
  it("accepts absolute http(s) urls and rejects non-urls", () => {
    expect(parseCover(" https://img.example/a.png ").ok).toBe(true);
    expect(parseCover("http://img.example/a.png")).toMatchObject({
      ok: true,
      value: "http://img.example/a.png",
    });
    expect(parseCover(null)).toEqual({ ok: true, value: null });
    expect(parseCover("not a url")).toMatchObject({ ok: false, error: "validation_error" });
    expect(parseCover("javascript:alert(1)")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parseCover("data:image/png;base64,aaaa")).toMatchObject({
      ok: false,
      error: "validation_error",
    });
  });

  it("recognizes only this application's media urls", () => {
    const base = "https://merclink.example";
    expect(mediaUrl(base, "img_owned")).toBe("https://merclink.example/media/img_owned");
    expect(mediaImageId("https://merclink.example/media/img_owned", base)).toBe("img_owned");
    expect(mediaImageId("https://img.example/a.png", base)).toBeNull();
    expect(mediaImageId("https://merclink.example/products/prd_1", base)).toBeNull();
  });
});
