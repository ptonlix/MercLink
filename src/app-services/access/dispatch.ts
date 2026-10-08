import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import Provider from "oidc-provider";

export async function dispatchOidc(provider: Provider, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const originalUrl = `${url.pathname}${url.search}`;
  let pathname = url.pathname;
  if (pathname === "/oauth" || pathname.startsWith("/oauth/")) {
    pathname = pathname.slice("/oauth".length) || "/";
  }
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? Buffer.alloc(0)
      : Buffer.from(await request.arrayBuffer());
  const socket = new Socket();
  Object.assign(socket, { encrypted: url.protocol === "https:" });
  const req = new IncomingMessage(socket);
  req.method = request.method;
  req.url = `${pathname}${url.search}`;
  req.headers = Object.fromEntries(request.headers.entries());
  req.headers.host = url.host;
  req.headers["content-length"] = String(body.length);
  Object.assign(req, { originalUrl, socket });
  if (body.length > 0) {
    req.push(body);
  }
  req.push(null);

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    res.write = ((chunk: unknown) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
      return true;
    }) as typeof res.write;
    res.end = ((chunk?: unknown) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
      resolve();
      return res;
    }) as typeof res.end;
    res.on("error", reject);
    try {
      provider.callback()(req, res);
    } catch (error: unknown) {
      reject(error instanceof Error ? error : new Error("oidc dispatch failed"));
    }
  });

  const headers = new Headers();
  for (const [key, value] of Object.entries(res.getHeaders())) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, headerText(item));
      }
    } else if (value !== undefined) {
      headers.set(key, headerText(value));
    }
  }
  return new Response(chunks.length === 0 ? null : Buffer.concat(chunks), {
    status: res.statusCode,
    headers,
  });
}

function headerText(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}
