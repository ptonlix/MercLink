import { describe, expect, it } from "vitest";
import { readEnvelope, SmokeClient } from "./client";

// Hits a started process through SmokeClient. Runs only when SMOKE_PURCHASE=0,
// which means the operator asserts that process did not start with MERCLINK_PURCHASE=1.
// The standard suite sets SMOKE_PURCHASE=1 and must skip instead of asserting 40302.
const targetsDisabledProcess = process.env.SMOKE_PURCHASE === "0";

describe.skipIf(!targetsDisabledProcess)(
  "purchase disabled smoke — 仅当 SMOKE_PURCHASE=0 明确表示目标进程未开启买入时运行。标准冒烟进程是 MERCLINK_PURCHASE=1 且要求 SMOKE_PURCHASE=1，不能对它断言 40302。未设置该信号时，本文件不算已覆盖。",
  () => {
    it("keeps discovery and rejects order placement with 40302", async () => {
      const client = new SmokeClient();
      const discovered = await client.request("/llms.txt");
      expect(discovered.status).toBe(200);
      const directory = await discovered.text();
      expect(directory).toContain("/products");
      expect(directory).toContain("用户 Skill");
      expect(directory).not.toContain("下一笔只有一行的订单");

      const order = await client.request("/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_order_no: "smoke-disabled",
          items: [{ variant_id: "var_missing", qty: 1 }],
        }),
      });
      const body = await readEnvelope(order);
      expect(order.status).toBe(403);
      expect(body.code).toBe(40302);
      expect(body.data).toBeNull();
      expect(body).not.toHaveProperty("error");
      // Public product JSON can show stock, but this rejected call has no known variant
      // to compare. Stock is locked by the commerce purchase-mode unit test.
    });
  },
);
