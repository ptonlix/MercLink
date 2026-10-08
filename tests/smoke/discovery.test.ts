import { describe, expect, it } from "vitest";
import { SmokeClient, readEnvelope } from "./client";

describe("discovery", () => {
  const client = new SmokeClient();

  it("keeps health, metadata, and skills outside the envelope", async () => {
    const health = await client.request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const metadata = await client.request("/.well-known/oauth-protected-resource");
    expect(metadata.status).toBe(200);
    const metadataBody = (await metadata.json()) as Record<string, unknown>;
    expect(metadataBody).not.toHaveProperty("request_id");
    expect(metadataBody).not.toHaveProperty("code");
    expect(metadataBody.resource).toBe(`${client.config.baseUrl}/api/v1`);
    expect(metadataBody.authorization_servers).toEqual([`${client.config.baseUrl}/oauth`]);

    const skill = await client.request("/agent-docs/buyer-skill");
    expect(skill.status).toBe(200);
    expect(skill.headers.get("content-type")).toContain("text/markdown");
    expect(await skill.text()).toContain("code");

    const llms = await client.request("/llms.txt");
    expect(llms.status).toBe(200);
    expect(llms.headers.get("content-type")).not.toContain("application/json");
  });

  it("lists products with cursor fields inside data", async () => {
    const response = await client.request("/api/v1/products");
    const body = await readEnvelope(response);
    expect(response.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.message).toBe("成功");
    expect(body.data).toMatchObject({ items: expect.any(Array) });
    expect(body.data).toHaveProperty("next_cursor");
    expect(body.data).not.toHaveProperty("pageNum");
    expect(body.data).not.toHaveProperty("list");
    expect(body.data).not.toHaveProperty("total");
  });
});
