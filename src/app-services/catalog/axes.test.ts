import { describe, expect, it } from "vitest";
import { POST as rejectedOptions } from "../../app/api/v1/catalogs/[id]/products/[product_id]/options/route";

describe("retired axes path", () => {
  it("rejects the old options path", () => {
    expect(rejectedOptions().status).toBe(404);
  });
});
