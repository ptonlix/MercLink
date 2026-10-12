import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { purchaseDisabledMessage, resetPurchaseModeCache } from "../../shared/purchase-mode";
import { approveBuyerAgent, gateDeviceAuthorization } from "./device-gate";

beforeEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

afterEach(() => {
  delete process.env.MERCLINK_PURCHASE;
  resetPurchaseModeCache();
});

describe("device authorization gate", () => {
  it("rejects an order-only device request before a code can be issued", async () => {
    const response = await gateDeviceAuthorization(
      new Request("http://localhost/oauth/device/auth", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=merclink-agent&scope=order%3Awrite+order%3Aread",
      }),
    );
    expect(response).toBeInstanceOf(Response);
    if (response instanceof Response) {
      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toEqual({
        error: "invalid_scope",
        error_description: "invalid_scope",
      });
      expect(JSON.stringify(body)).not.toContain("device_code");
    }
  });

  it("leaves a merchant device request for the authorization server", async () => {
    const response = await gateDeviceAuthorization(
      new Request("http://localhost/oauth/device/auth", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=merclink-agent&scope=product%3Awrite",
      }),
    );
    expect(response).toBeInstanceOf(Request);
  });

  it("does not approve a buyer or open the provider when purchase is disabled", async () => {
    const approved = await approveBuyerAgent({
      sql: {} as never,
      cookieHeader: "",
      ownerId: "byr_1",
      provider: () => Promise.reject(new Error("provider")),
    });
    expect(approved).toEqual({ ok: false, notice: purchaseDisabledMessage });
    const route = await readFile("src/app/authorize/buyer/submit/route.ts", "utf8");
    expect(route).toContain("approveBuyerAgent(");
    expect(route).not.toMatch(/\bapproveAgent\s*\(/);
  });
});
