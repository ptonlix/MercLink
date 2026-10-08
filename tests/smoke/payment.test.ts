import { describe, expect, it } from "vitest";
import { buyerAccessToken, merchantAccessToken } from "./actors";
import { assertDevStubs, readEnvelope, SmokeClient } from "./client";
import { placePendingOrder } from "./orders";

describe("payment", () => {
  it("rejects an invalid notification as plain text and leaves the order pending", async () => {
    assertDevStubs();
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const buyer = await buyerAccessToken(client);
    client.clearCookies();
    const pending = await placePendingOrder(client, merchant.token, buyer);

    const notify = await client.request("/api/v1/payments/alipay/notify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "trade_status=TRADE_SUCCESS",
    });
    expect(notify.status).toBe(200);
    expect(notify.headers.get("content-type")).toContain("text/plain");
    expect(await notify.text()).toBe("fail");

    const read = await client.request(`/api/v1/orders/${pending.orderId}`, {
      headers: { authorization: `Bearer ${buyer}` },
    });
    const body = await readEnvelope(read);
    expect(read.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.data).toMatchObject({ status: "pending" });
  });
});
