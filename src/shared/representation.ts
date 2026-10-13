import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const compressibleTypes = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "text/plain",
  "text/markdown",
  "application/javascript",
  "application/json",
  "application/xml",
  "image/svg+xml",
]);

export function entityTag(token: string): string {
  const digest = createHash("sha256").update(token).digest("base64url");
  return `W/"${digest}"`;
}

export function ifNoneMatch(header: string | null, tag: string): boolean {
  if (header === null || header.trim() === "") {
    return false;
  }
  const expected = weakComparable(tag);
  return etagList(header).some((value) => value === "*" || weakComparable(value) === expected);
}

export function encodeBody(
  bytes: Uint8Array,
  contentType: string,
  acceptEncoding: string | null,
): { bytes: Uint8Array; encoding: "gzip" | null } {
  if (!compressible(contentType) || !acceptsGzip(acceptEncoding)) {
    return { bytes, encoding: null };
  }
  const gzipped = gzipSync(bytes);
  if (gzipped.byteLength >= bytes.byteLength) {
    return { bytes, encoding: null };
  }
  return { bytes: gzipped, encoding: "gzip" };
}

export function compressible(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return compressibleTypes.has(type);
}

function acceptsGzip(header: string | null): boolean {
  if (header === null) {
    return false;
  }
  return header.split(",").some((part) => gzipQuality(part) > 0);
}

function gzipQuality(part: string): number {
  const pieces = part
    .trim()
    .toLowerCase()
    .split(";")
    .map((piece) => piece.trim());
  const coding = pieces[0];
  if (coding !== "gzip" && coding !== "x-gzip") {
    return 0;
  }
  for (const param of pieces.slice(1)) {
    if (!param.startsWith("q=")) {
      continue;
    }
    const quality = Number(param.slice(2));
    return Number.isFinite(quality) ? quality : 0;
  }
  return 1;
}

function etagList(header: string): string[] {
  const values: string[] = [];
  let index = 0;
  while (index < header.length) {
    while (
      index < header.length &&
      (header[index] === " " || header[index] === "," || header[index] === "\t")
    ) {
      index += 1;
    }
    if (index >= header.length) {
      break;
    }
    if (header[index] === "*") {
      values.push("*");
      index += 1;
      continue;
    }
    let weak = false;
    if (header.startsWith("W/", index) || header.startsWith("w/", index)) {
      weak = true;
      index += 2;
    }
    if (header[index] !== '"') {
      const start = index;
      while (index < header.length && header[index] !== ",") {
        index += 1;
      }
      values.push(header.slice(start, index).trim());
      continue;
    }
    index += 1;
    let token = "";
    while (index < header.length) {
      const current = header[index];
      if (current === undefined || current === '"') {
        break;
      }
      if (current === "\\") {
        const escaped = header[index + 1];
        if (escaped === undefined) {
          break;
        }
        token += escaped;
        index += 2;
        continue;
      }
      token += current;
      index += 1;
    }
    if (header[index] === '"') {
      index += 1;
    }
    values.push(`${weak ? "W/" : ""}"${token}"`);
  }
  return values;
}

function weakComparable(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("W/") || trimmed.startsWith("w/") ? trimmed.slice(2).trim() : trimmed;
}
