import { describe, expect, it } from "vitest";
import { POST as rejectedOptions } from "../../app/api/v1/catalogs/[id]/products/[product_id]/options/route";

describe("retired axes path", () => {
  it("rejects the old options path with a not_found envelope", async () => {
    const response = rejectedOptions();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 40400,
      data: null,
      message: "没有找到。",
    });
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
