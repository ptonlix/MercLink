import { describe, expect, it } from "vitest";
import { readEnvelope, SmokeClient } from "./client";

describe("catalog", () => {
  const client = new SmokeClient();

  it("rejects the retired options route with not_found", async () => {
    const response = await client.request(
      "/api/v1/catalogs/cat_missing/products/prd_missing/options",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    const body = await readEnvelope(response);
    expect(response.status).toBe(404);
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });

  it("reads a missing public product through the envelope", async () => {
    const response = await client.request("/api/v1/products/prd_missing");
    const body = await readEnvelope(response);
    expect(response.status).toBe(404);
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });
});
