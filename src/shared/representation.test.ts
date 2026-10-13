import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeBody, entityTag, ifNoneMatch } from "./representation";

describe("representation", () => {
  it("matches a weak validator without reading another representation", () => {
    const tag = entityTag("storefront/releases/sfr_1/static/a,b.css\n");
    expect(tag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect(ifNoneMatch(tag, tag)).toBe(true);
    expect(ifNoneMatch(tag.slice(2), tag)).toBe(true);
    expect(ifNoneMatch(`${tag}, W/"other"`, tag)).toBe(true);
    expect(ifNoneMatch("*", tag)).toBe(true);
    expect(ifNoneMatch(null, tag)).toBe(false);
    expect(ifNoneMatch('W/"other"', tag)).toBe(false);
  });

  it("gzips text and leaves images unchanged", () => {
    const css = new TextEncoder().encode(`.card{color:#111;padding:12px}`.repeat(40));
    const encoded = encodeBody(css, "text/css; charset=utf-8", "gzip, deflate, br");
    expect(encoded.encoding).toBe("gzip");
    expect(new TextDecoder().decode(gunzipSync(encoded.bytes))).toBe(new TextDecoder().decode(css));
    expect(encodeBody(css, "image/webp", "gzip").encoding).toBeNull();
    expect(encodeBody(css, "text/css", null).encoding).toBeNull();
    expect(encodeBody(css, "text/css", "gzip;q=0").encoding).toBeNull();
    const small = new TextEncoder().encode("a".repeat(80));
    expect(encodeBody(small, "text/css", "gzip").encoding).toBe("gzip");
  });
});
