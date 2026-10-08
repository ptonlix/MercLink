import { describe, expect, it } from "vitest";
import { merchantAccessToken } from "./actors";
import { readEnvelope, SmokeClient } from "./client";

describe("account keys", () => {
  it("uses the account cookie instead of a bearer token", async () => {
    const client = new SmokeClient();
    const missing = await client.request("/api/v1/api-keys");
    const missingBody = await readEnvelope(missing);
    expect(missing.status).toBe(401);
    expect(missingBody.code).toBe(40100);

    await merchantAccessToken(client);
    const listed = await client.request("/api/v1/api-keys");
    const body = await readEnvelope(listed);
    expect(listed.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.data).toMatchObject({ items: expect.any(Array) });
    expect(body.data).not.toHaveProperty("pageNum");
    expect(listed.headers.get("www-authenticate")).toBeNull();
  });
});
