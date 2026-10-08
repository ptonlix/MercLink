import { describe, expect, it } from "vitest";
import { examplePath, readEnvelope, SmokeClient } from "./client";
import { bearerRoutes } from "./manifest";

describe("authentication gate", () => {
  const client = new SmokeClient();

  it.each(bearerRoutes().map((route) => [route.method, route.path] as const))(
    "%s %s without a bearer token is 401 and code 40100",
    async (method, path) => {
      const response = await client.request(examplePath(path), {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });
      const body = await readEnvelope(response);
      expect(response.status).toBe(401);
      expect(body.code).toBe(40100);
      expect(body.data).toBeNull();
      expect(response.headers.get("www-authenticate")).toContain(
        "/.well-known/oauth-protected-resource",
      );
    },
  );
});
