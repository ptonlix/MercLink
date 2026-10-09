import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { config } from "../../proxy";

function covers(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("storefront proxy matcher", () => {
  it("does not cover /api, so upload bodies are not truncated before the route", async () => {
    expect(config.matcher).toEqual(["/((?!api|_next/static|_next/image|favicon.ico).*)"]);
    expect(covers("/api")).toBe(false);
    expect(covers("/api/v1/storefront/releases")).toBe(false);
    expect(covers("/products")).toBe(true);
    expect(covers("/")).toBe(true);
    const source = await readFile("src/proxy.ts", "utf8");
    expect(source).toContain("不能匹配 /api");
    expect(source).not.toContain("proxyClientMaxBodySize");
  });
});
