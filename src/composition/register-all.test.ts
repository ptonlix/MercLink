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
});
