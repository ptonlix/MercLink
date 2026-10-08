import { describe, expect, it } from "vitest";
import { buyerAccessToken, merchantAccessToken } from "./actors";
import { assertDevStubs, readEnvelope, SmokeClient } from "./client";
import { placePendingOrder } from "./orders";

describe("journey", () => {
  it("reaches paid only after the development payment stub confirms", async () => {
    assertDevStubs();
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const buyer = await buyerAccessToken(client);
    client.clearCookies();
    const pending = await placePendingOrder(client, merchant.token, buyer);
    expect(pending.status).toBe("pending");

    const confirmed = await client.request(`/dev/pay/${pending.paymentId}/confirm`, {
      method: "POST",
    });
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("content-type") ?? "").not.toContain("application/json");

    const read = await client.request(`/api/v1/orders/${pending.orderId}`, {
      headers: { authorization: `Bearer ${buyer}` },
    });
    const body = await readEnvelope(read);
    expect(read.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.data).toMatchObject({ status: "paid" });
  });
});
