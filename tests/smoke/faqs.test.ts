import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { merchantAccessToken } from "./actors";
import { assertSuccess, readEnvelope, SmokeClient, type Envelope } from "./client";

describe("merchant faqs", () => {
  it("shows a published store FAQ under the shelf and a product FAQ only on that product", async () => {
    const client = new SmokeClient();
    const merchant = await merchantAccessToken(client);
    client.clearCookies();
    const suffix = randomBytes(4).toString("hex");
    const storeQuestion = `全店什么时候发货 ${suffix}`;
    const storeAnswer = `付款后两个工作日 ${suffix}`;
    const productQuestion = `这件有几种规格 ${suffix}`;
    const productAnswer = `按页面上的可售规格 ${suffix}`;
    const saved = await jsonRequest(client, "/api/v1/merchant/faqs", merchant.token, "GET");
    assertSuccess(saved.body, saved.status);
    const previous = record(saved.body.data);

    try {
      const cleared = await jsonRequest(client, "/api/v1/merchant/faqs", merchant.token, "PUT", {
        published: false,
        items: [],
      });
      assertSuccess(cleared.body, cleared.status);

      const catalog = await jsonRequest(client, "/api/v1/catalogs", merchant.token, "POST", {
        name: `冒烟问答 ${suffix}`,
        currency: "CNY",
      });
      assertSuccess(catalog.body, catalog.status);
      const catalogId = stringField(catalog.body.data, "id");
      const created = await jsonRequest(
        client,
        `/api/v1/catalogs/${catalogId}/products`,
        merchant.token,
        "POST",
        { title: `冒烟问答商品 ${suffix}`, price: 159900, stock: 1 },
      );
      assertSuccess(created.body, created.status);
      expect(record(created.body.data)).not.toHaveProperty("faqs");
      const productId = stringField(created.body.data, "id");

      const drafted = await jsonRequest(
        client,
        `/api/v1/catalogs/${catalogId}/products/${productId}/faqs`,
        merchant.token,
        "PUT",
        {
          published: true,
          items: [{ question: productQuestion, answer: productAnswer }],
        },
      );
      assertSuccess(drafted.body, drafted.status);

      const hidden = await client.request(`/products/${productId}`);
      expect(hidden.status).toBe(404);
      const hiddenText = await hidden.text();
      expect(hiddenText).not.toContain(productQuestion);
      expect(notIndexable(hidden, hiddenText)).toBe(true);

      const quietHome = await client.request("/");
      expect(quietHome.status).toBe(200);
      expect(await quietHome.text()).not.toContain("常见问题");

      const published = await jsonRequest(
        client,
        `/api/v1/catalogs/${catalogId}/products/${productId}/publish`,
        merchant.token,
        "POST",
        {},
      );
      assertSuccess(published.body, published.status);

      const detail = await client.request(`/api/v1/products/${productId}`);
      const detailBody = await readEnvelope(detail);
      expect(detail.status).toBe(200);
      expect(detailBody.code).toBe(200);
      expect(record(detailBody.data).faqs).toEqual([
        { question: productQuestion, answer: productAnswer },
      ]);
      const detailHtml = await textAt(client, `/products/${productId}`);
      const articleHtml = between(detailHtml, "<article", "</article>");
      expect(articleHtml).toContain(`冒烟问答商品 ${suffix}`);
      expect(articleHtml).toContain("查看用户 Skill");
      expect(articleHtml).not.toContain(productQuestion);
      const afterArticle = detailHtml.slice(detailHtml.indexOf("</article>"));
      expect(afterArticle).toContain(productQuestion);
      expect(afterArticle).toContain(productAnswer);
      expect(detailHtml).not.toContain(storeQuestion);

      const listHtml = await textAt(client, "/products");
      expect(listHtml).not.toContain(productQuestion);
      const list = await client.request("/api/v1/products");
      const listBody = await readEnvelope(list);
      expect(list.status).toBe(200);
      expect(JSON.stringify(listBody.data)).not.toContain(productQuestion);

      const storeFaq = await jsonRequest(client, "/api/v1/merchant/faqs", merchant.token, "PUT", {
        published: true,
        items: [{ question: storeQuestion, answer: storeAnswer }],
      });
      assertSuccess(storeFaq.body, storeFaq.status);

      const homeHtml = await textAt(client, "/");
      const belowShelf = between(homeHtml, ">商品货架<", "如何使用 MercLink");
      expect(belowShelf.indexOf(">常见问题<")).toBeLessThan(belowShelf.indexOf(storeQuestion));
      expect(belowShelf).toContain(storeAnswer);
      expect(homeHtml).not.toContain(productQuestion);
      expect(homeHtml).not.toContain(productQuestion);

      const store = await client.request("/api/v1/store");
      const storeBody = await readEnvelope(store);
      expect(store.status).toBe(200);
      expect(storeBody.code).toBe(200);
      expect(record(storeBody.data).faqs).toEqual([
        { question: storeQuestion, answer: storeAnswer },
      ]);

      const detailAfterStore = await textAt(client, `/products/${productId}`);
      expect(detailAfterStore).toContain(productQuestion);
      expect(detailAfterStore).not.toContain(storeQuestion);

      const unpublished = await jsonRequest(
        client,
        `/api/v1/catalogs/${catalogId}/products/${productId}/unpublish`,
        merchant.token,
        "POST",
        {},
      );
      assertSuccess(unpublished.body, unpublished.status);
      const kept = await jsonRequest(
        client,
        `/api/v1/catalogs/${catalogId}/products/${productId}/faqs`,
        merchant.token,
        "GET",
      );
      assertSuccess(kept.body, kept.status);
      expect(record(kept.body.data).published).toBe(true);
      const gone = await client.request(`/api/v1/products/${productId}`);
      expect(gone.status).toBe(404);
      expect(await gone.text()).not.toContain(productQuestion);
    } finally {
      const restored = await jsonRequest(client, "/api/v1/merchant/faqs", merchant.token, "PUT", {
        published: previous.published === true,
        items: Array.isArray(previous.items) ? previous.items : [],
      });
      assertSuccess(restored.body, restored.status);
    }
  });
});

async function textAt(client: SmokeClient, path: string): Promise<string> {
  const response = await client.request(path);
  expect(response.status).toBe(200);
  return response.text();
}

async function jsonRequest(
  client: SmokeClient,
  path: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope }> {
  const response = await client.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await readEnvelope(response) };
}

function notIndexable(response: Response, body: string): boolean {
  const header = response.headers.get("x-robots-tag");
  if (header !== null) {
    return header.includes("noindex");
  }
  return /noindex/i.test(body) || body.includes("没有找到");
}

function between(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return html.slice(from, to);
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
