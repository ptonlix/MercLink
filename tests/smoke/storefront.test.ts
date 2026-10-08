import { describe, expect, it } from "vitest";
import { readEnvelope, SmokeClient } from "./client";

describe("storefront", () => {
  const client = new SmokeClient();

  it("reads the public store through the envelope", async () => {
    const response = await client.request("/api/v1/store");
    const body = await readEnvelope(response);
    expect(body.timestamp).toEqual(expect.any(Number));
    expect(body.request_id.startsWith("req_")).toBe(true);
    if (response.status === 200) {
      expect(body.code).toBe(200);
      expect(body.message).toBe("成功");
      expect(body.data).toMatchObject({
        display_name: expect.any(String),
        summary: expect.any(String),
      });
      expect(body.data).not.toHaveProperty("pageNum");
      return;
    }
    expect(response.status).toBe(404);
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });
});
