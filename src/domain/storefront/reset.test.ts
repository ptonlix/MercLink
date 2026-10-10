import { describe, expect, it } from "vitest";
import { resetExecutionAllowed } from "./reset";

describe("storefront reset approval", () => {
  it("lets only an admin execute a pending request", () => {
    expect(resetExecutionAllowed("pending", "agent")).toBe(false);
    expect(resetExecutionAllowed("pending", "admin")).toBe(true);
    expect(resetExecutionAllowed("executed", "admin")).toBe(false);
    expect(resetExecutionAllowed("rejected", "admin")).toBe(false);
  });
});
