import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const reservedPrefixes = ["/api", "/authorize", "/oauth", "/admin", "/media", "/.well-known"];
const reservedExact = new Set([
  "/skill.md",
  "/merchant/skill.md",
  "/storefront/skill.md",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
]);

export function shouldProxy(pathname) {
  if (reservedExact.has(pathname)) {
    return true;
  }
  return reservedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const origin = process.env.STOREFRONT_ORIGIN ?? "http://127.0.0.1:3000";
  const root = path.resolve(process.argv[2] ?? "static");
  const port = Number(process.env.PORT ?? "4173");
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin);
    if (shouldProxy(url.pathname)) {
      const target = new URL(`${url.pathname}${url.search}`, origin);
      fetch(target, { method: request.method, redirect: "manual" })
        .then(async (upstream) => {
          response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
          response.end(Buffer.from(await upstream.arrayBuffer()));
        })
        .catch(() => {
          response.writeHead(502);
          response.end("proxy failed");
        });
      return;
    }
    const file = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
    access(file)
      .then(() => {
        response.writeHead(200);
        createReadStream(file).pipe(response);
      })
      .catch(() => {
        response.writeHead(404);
        response.end("not found");
      });
  });
  server.listen(port);
}
