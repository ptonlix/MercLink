import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { merchantAccessToken } from "./actors";
import { assertSuccess, readEnvelope, SmokeClient, type Envelope } from "./client";

describe("product description", () => {
  it("returns an optional description and shows it only on the product page", async () => {
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const suffix = randomBytes(4).toString("hex");
    const description = `第一行 ${suffix}\n第二行 <b>${suffix}</b>`;

    const catalog = await jsonRequest(client, "/api/v1/catalogs", merchant.token, "POST", {
      name: `冒烟描述 ${suffix}`,
      currency: "CNY",
    });
    assertSuccess(catalog.body, catalog.status);
    const catalogId = stringField(catalog.body.data, "id");

    const created = await jsonRequest(
      client,
      `/api/v1/catalogs/${catalogId}/products`,
      merchant.token,
      "POST",
      { title: "冒烟商品", price: 159900, stock: 1 },
    );
    assertSuccess(created.body, created.status);
    const createdProduct = record(created.body.data);
    expect(createdProduct.description).toBeNull();
    expect(createdProduct.fields).not.toHaveProperty("description");
    const productId = stringField(created.body.data, "id");

    const patched = await jsonRequest(
      client,
      `/api/v1/catalogs/${catalogId}/products/${productId}`,
      merchant.token,
      "PATCH",
      { description },
    );
    assertSuccess(patched.body, patched.status);
    expect(record(patched.body.data).description).toBe(description);

    const published = await jsonRequest(
      client,
      `/api/v1/catalogs/${catalogId}/products/${productId}/publish`,
      merchant.token,
      "POST",
      {},
    );
    assertSuccess(published.body, published.status);

    const readable = await client.request(`/api/v1/products/${productId}`);
    const body = await readEnvelope(readable);
    expect(readable.status).toBe(200);
    expect(body.code).toBe(200);
    const product = record(body.data);
    expect(product.description).toBe(description);
    expect(product.fields).not.toHaveProperty("description");

    const detail = await client.request(`/products/${productId}`);
    expect(detail.status).toBe(200);
    const html = await detail.text();
    expect(html).toContain(`第一行 ${suffix}`);
    expect(html).toContain(`第二行 &lt;b&gt;${suffix}&lt;/b&gt;`);
    expect(html).not.toContain(`<b>${suffix}</b>`);

    const list = await client.request("/products");
    expect(list.status).toBe(200);
    expect(await list.text()).not.toContain(suffix);

    const home = await client.request("/");
    expect(home.status).toBe(200);
    expect(await home.text()).not.toContain(suffix);
  });
});

async function jsonRequest(
  client: SmokeClient,
  path: string,
  token: string,
  method: string,
  body: unknown,
): Promise<{ status: number; body: Envelope }> {
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

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("expected an object");
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, key: string): string {
  const found = record(value)[key];
  if (typeof found !== "string" || found.length === 0) {
    throw new Error(`${key} is not a string`);
  }
  return found;
}
