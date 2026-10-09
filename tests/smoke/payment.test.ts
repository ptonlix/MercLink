import { describe, expect, it } from "vitest";
import { buyerAccessToken, merchantAccessToken } from "./actors";
import { assertDevStubs, readEnvelope, SmokeClient } from "./client";
import { placePendingOrder } from "./orders";

describe("payment", () => {
  it("uses the startup provider and rejects a caller-selected provider", async () => {
    assertDevStubs();
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const buyer = await buyerAccessToken(client);
    client.clearCookies();
    const pending = await placePendingOrder(client, merchant.token, buyer);

    expect(pending.status).toBe("pending");
    expect(pending.provider).toMatch(/^(alipay|easypay)$/);
    expect(pending.channel).toBe("desktop");
    expect(pending.action).toMatch(/^https:\/\//);

    const rejected = await client.request("/api/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Bearer ${buyer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_order_no: `smoke-provider-${pending.paymentId}`,
        payment_provider: pending.provider === "alipay" ? "easypay" : "alipay",
        items: [{ variant_id: "var_missing", qty: 1 }],
      }),
    });
    const rejectedBody = await readEnvelope(rejected);
    expect(rejected.status).toBe(400);
    expect(rejectedBody.code).toBe(40000);
    expect(rejectedBody.data).toBeNull();
  });

  it("rejects an invalid notification as plain text and leaves the order pending", async () => {
    assertDevStubs();
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const buyer = await buyerAccessToken(client);
    client.clearCookies();
    const pending = await placePendingOrder(client, merchant.token, buyer);
    const notifyPath =
      pending.provider === "easypay"
        ? "/api/v1/payments/easypay/notify"
        : "/api/v1/payments/alipay/notify";

    const notify = await client.request(notifyPath, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${pending.paymentId}&trade_status=TRADE_SUCCESS`,
    });
    expect(notify.status).toBe(200);
    expect(notify.headers.get("content-type")).toContain("text/plain");
    expect(await notify.text()).toBe("fail");

    const other = await client.request("/api/v1/payments/easypay/notify?trade_status=TRADE_SUCCESS", {
      method: "GET",
    });
    expect(other.status).toBe(200);
    expect(other.headers.get("content-type")).toContain("text/plain");
    expect(await other.text()).toBe("fail");

    const read = await client.request(`/api/v1/orders/${pending.orderId}`, {
      headers: { authorization: `Bearer ${buyer}` },
    });
    const body = await readEnvelope(read);
    expect(read.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.data).toMatchObject({ status: "pending" });
  });

  it("does not resolve a receipt before a late payment exists", async () => {
    assertDevStubs();
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const buyer = await buyerAccessToken(client);
    client.clearCookies();
    const pending = await placePendingOrder(client, merchant.token, buyer);

    const resolved = await client.request(
      `/api/v1/manage/payments/${pending.paymentId}/unapplied-receipt`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${merchant.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "fulfill_manually" }),
      },
    );
    const body = await readEnvelope(resolved);
    expect(resolved.status).toBe(404);
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });
});
