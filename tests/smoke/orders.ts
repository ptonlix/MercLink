import { randomBytes } from "node:crypto";
import { assertSuccess, readEnvelope, SmokeClient } from "./client";

export type PendingOrder = {
  orderId: string;
  paymentId: string;
  status: string;
};

export async function placePendingOrder(
  client: SmokeClient,
  merchantToken: string,
  buyerToken: string,
): Promise<PendingOrder> {
  const catalog = await jsonRequest(client, "/api/v1/catalogs", merchantToken, "POST", {
    name: "冒烟目录",
    currency: "CNY",
  });
  assertSuccess(catalog.body, catalog.status);
  const catalogId = field(catalog.body.data, "id");

  const fieldCreated = await jsonRequest(
    client,
    `/api/v1/catalogs/${catalogId}/fields`,
    merchantToken,
    "POST",
    { key: "weight_g", label: "重量", type: "number", required: false },
  );
  assertSuccess(fieldCreated.body, fieldCreated.status);

  const product = await jsonRequest(
    client,
    `/api/v1/catalogs/${catalogId}/products`,
    merchantToken,
    "POST",
    { title: "冒烟商品", price: 159900, stock: 4, fields: { weight_g: 480 } },
  );
  assertSuccess(product.body, product.status);
  const productId = field(product.body.data, "id");
  const variants = recordField(product.body.data, "variants");
  const variantId = Array.isArray(variants) ? field(variants[0], "id") : "";
  if (variantId === "") {
    throw new Error("product create did not return a variant");
  }

  const published = await jsonRequest(
    client,
    `/api/v1/catalogs/${catalogId}/products/${productId}/publish`,
    merchantToken,
    "POST",
    {},
  );
  assertSuccess(published.body, published.status);

  const suffix = randomBytes(4).toString("hex");
  const order = await jsonRequest(client, "/api/v1/orders", buyerToken, "POST", {
    client_order_no: `smoke-${suffix}`,
    items: [{ variant_id: variantId, qty: 1 }],
  });
  assertSuccess(order.body, order.status);
  const payment = recordField(order.body.data, "payment");
  return {
    orderId: field(order.body.data, "id"),
    paymentId: field(payment, "id"),
    status: field(order.body.data, "status"),
  };
}

async function jsonRequest(
  client: SmokeClient,
  path: string,
  token: string,
  method: string,
  body: unknown,
): Promise<{ status: number; body: Awaited<ReturnType<typeof readEnvelope>> }> {
  const response = await client.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await readEnvelope(response) };
}

function recordField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`missing ${key}`);
  }
  return (value as Record<string, unknown>)[key];
}

function field(value: unknown, key: string): string {
  const found = recordField(value, key);
  if (typeof found !== "string") {
    throw new Error(`${key} is not a string`);
  }
  return found;
}
