import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isCompositionReady, runCompositionSteps } from "./register-all";

describe("composition registration", () => {
  it("stays unready when any slice registration throws", async () => {
    await expect(
      runCompositionSteps([
        () => undefined,
        () => {
          throw new Error("catalog registration failed");
        },
      ]),
    ).rejects.toThrow("catalog registration failed");
    expect(isCompositionReady()).toBe(false);
  });

  it("asks catalog and identity seams instead of inlining their tables", async () => {
    const source = await readFile("src/composition/register-all.ts", "utf8");
    const access = await readFile("src/app-services/access/authenticate.ts", "utf8");
    expect(source).toContain("listMerchantCatalogIds");
    expect(source).toContain("accountCanAuthenticate");
    expect(source).not.toContain("FROM catalogs");
    expect(source).not.toContain("FROM buyers");
    expect(source).not.toContain("FROM merchants");
    expect(access).toContain("accountCanAuthenticate");
    expect(access).not.toContain("FROM buyers");
    expect(access).not.toContain("FROM merchants");
    expect(access).not.toContain("domain/identity");
  });
});
