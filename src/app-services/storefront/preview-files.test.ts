import { execFile, spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { renderDocument, type SlotContext } from "../../domain/storefront/slots";
import { previewProxyTarget } from "../../../storefront/preview.mjs";

const previewScript = path.join(process.cwd(), "storefront", "preview.mjs");
const children: { kill: (signal?: NodeJS.Signals) => boolean }[] = [];
const roots: string[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill("SIGTERM");
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("preview proxy target", () => {
  const origin = "http://127.0.0.1:3000";

  it("keeps a reserved path on the configured origin", () => {
    expect(previewProxyTarget("/api/v1/products?limit=20", origin)?.href).toBe(
      "http://127.0.0.1:3000/api/v1/products?limit=20",
    );
  });

  it("does not follow a request that names another host", () => {
    expect(previewProxyTarget("http://169.254.169.254/latest/meta-data/", origin)).toBeNull();
    expect(previewProxyTarget("//evil.example/api/v1", origin)?.href).toBe(
      "http://127.0.0.1:3000/api/v1",
    );
    expect(previewProxyTarget("http://127.0.0.1:3000@evil.example/media/img", origin)?.href).toBe(
      "http://127.0.0.1:3000/media/img",
    );
    expect(previewProxyTarget("\\\\evil.example\\api", origin)?.href).toBe(
      "http://127.0.0.1:3000/api",
    );
  });

  it("rejects a non-http origin and a path outside the reserved set", () => {
    expect(previewProxyTarget("/api/v1", "file:///tmp")).toBeNull();
    expect(previewProxyTarget("/api/v1", "http://user:pass@127.0.0.1:3000")).toBeNull();
    expect(previewProxyTarget("/products/prd_1", origin)).toBeNull();
  });
});

describe("storefront preview files", () => {
  it("serves the product list from the directory index and stays up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "merclink-preview-"));
    roots.push(root);
    await mkdir(path.join(root, "products"));
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<p>home</p>");
    await writeFile(path.join(root, "products", "index.html"), "<p>list</p>");
    await writeFile(path.join(root, "products", "item.html"), "<p>item</p>");
    const outside = path.join(path.dirname(root), "merclink-preview-secret.txt");
    await writeFile(outside, "secret");

    const port = await freePort();
    const child = spawn(process.execPath, [previewScript, root], {
      env: { ...process.env, PORT: String(port), STOREFRONT_ORIGIN: "http://127.0.0.1:9" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    await waitForOk(port);
    const home = await textResponse(port, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("home");
    expect(home.body).not.toContain("secret");

    const products = await textResponse(port, "/products");
    expect(products.status).toBe(200);
    expect(products.body).toContain("list");
    const slashed = await textResponse(port, "/products/");
    expect(slashed.status).toBe(200);
    expect(slashed.body).toContain("list");

    const item = await textResponse(port, "/products/prd_1");
    expect(item.status).toBe(200);
    expect(item.body).toContain("item");

    const directory = await textResponse(port, "/assets");
    expect(directory.status).toBe(404);
    const missing = await textResponse(port, "/missing");
    expect(missing.status).toBe(404);
    const escaped = await rawResponse(port, "/%2e%2e/merclink-preview-secret.txt");
    expect(escaped.status).toBe(404);
    expect(escaped.body).not.toContain("secret");

    const still = await textResponse(port, "/");
    expect(still.status).toBe(200);
    expect(stderr).not.toContain("EISDIR");
    await rm(outside, { force: true });
  });

  it("does not fall a missing product list back to the home page", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "merclink-preview-"));
    roots.push(root);
    await mkdir(path.join(root, "products"));
    await writeFile(path.join(root, "index.html"), "<p>home-only</p>");
    const port = await freePort();
    const child = spawn(process.execPath, [previewScript, root], {
      env: { ...process.env, PORT: String(port), STOREFRONT_ORIGIN: "http://127.0.0.1:9" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    await waitForOk(port, "/");
    const products = await textResponse(port, "/products");
    expect(products.status).toBe(404);
    expect(products.body).not.toContain("home-only");
    const again = await textResponse(port, "/");
    expect(again.status).toBe(200);
  });

  it("fills store and product slots from the source deployment without activating", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "merclink-preview-"));
    roots.push(root);
    await mkdir(path.join(root, "products"));
    await writeFile(
      path.join(root, "index.html"),
      '<h1><merclink-slot name="store.display_name"></merclink-slot></h1>',
    );
    await writeFile(
      path.join(root, "products", "index.html"),
      '<template data-merclink="product"><a href="/products/{id}"><merclink-slot name="product.name"></merclink-slot><merclink-slot name="product.price"></merclink-slot></a></template>',
    );
    await writeFile(
      path.join(root, "products", "item.html"),
      '<p><merclink-slot name="product.name"></merclink-slot></p>',
    );
    const origin = await listenJson({
      "/api/v1/store": {
        code: 200,
        message: "ok",
        data: {
          display_name: "北海南珠",
          summary: "珍珠",
          website_url: null,
          logo_url: null,
          area_served: "全国",
          address: "合浦",
        },
      },
      "/api/v1/products": {
        code: 200,
        message: "ok",
        data: {
          items: [
            {
              id: "prd_1",
              title: "吊坠",
              cover: null,
              offer: { price: 168000, currency: "CNY", availability: "in_stock" },
              fields: {},
              variants: [],
            },
          ],
          next_cursor: null,
        },
      },
      "/api/v1/products/prd_1": {
        code: 200,
        message: "ok",
        data: {
          id: "prd_1",
          title: "吊坠",
          cover: null,
          offer: { price: 168000, currency: "CNY", availability: "in_stock" },
          fields: {},
          variants: [],
        },
      },
    });
    const port = await freePort();
    const child = spawn(process.execPath, [previewScript, root], {
      env: {
        ...process.env,
        PORT: String(port),
        STOREFRONT_ORIGIN: `http://127.0.0.1:${origin.port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    await waitForOk(port);
    const home = await textResponse(port, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("北海南珠");
    expect(home.body).not.toContain("merclink-slot");
    const products = await textResponse(port, "/products");
    expect(products.status).toBe(200);
    expect(products.body).toContain("吊坠");
    expect(products.body).toContain("¥1680.00");
    expect(products.body).toContain("/products/prd_1");
    const item = await textResponse(port, "/products/prd_1");
    expect(item.body).toContain("吊坠");
    origin.close();
  });

  it("uses the same slot replacement as the server renderer", async () => {
    const context: SlotContext = {
      store: {
        displayName: "A&B",
        summary: "简介",
        logo: null,
        website: "https://example.test",
        area: "全国",
        address: null,
      },
      products: [
        {
          id: "prd_1",
          name: "吊坠",
          cover: null,
          fields: { 珠层: "厚" },
          variants: [],
          stock: 1,
          availability: "in_stock",
          priceMinor: 168000,
        },
      ],
      product: null,
      orderStatus: "paid",
      nextCursor: "next cursor",
    };
    const html =
      '<merclink-slot name="store.display_name"></merclink-slot><template data-merclink="product"><a href="/products/{id}"><merclink-slot name="product.price"></merclink-slot></a></template><merclink-slot name="products.next"></merclink-slot><template data-merclink="order.paid">支付已完成</template>';
    const expected = renderDocument(html, context);
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { renderPreviewDocument } from './storefront/render-slots.mjs';
process.stdout.write(renderPreviewDocument(${JSON.stringify(html)}, ${JSON.stringify(context)}));`,
      ],
      { cwd: process.cwd() },
    );
    expect(stdout).toBe(expected);
  });
});

const execFileAsync = promisify(execFile);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close((error) => {
        if (error === undefined) {
          resolve(port);
          return;
        }
        reject(error);
      });
    });
  });
}

async function waitForOk(port: number, pathname = "/"): Promise<void> {
  const deadline = Date.now() + 3000;
  let last = "preview did not start";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
      if (response.ok) {
        return;
      }
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "connect failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(last);
}

async function textResponse(
  port: number,
  pathname: string,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: response.status, body: await response.text() };
}

function listenJson(routes: Record<string, unknown>): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const body = routes[pathname];
      if (body === undefined) {
        response.writeHead(404);
        response.end("missing");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        port,
        close: () => {
          server.close();
        },
      });
    });
  });
}

function rawResponse(port: number, rawPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { hostname: "127.0.0.1", port, path: rawPath, method: "GET" },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}
