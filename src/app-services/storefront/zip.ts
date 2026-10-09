import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { maxStorefrontBytes, maxStorefrontEntries } from "../../domain/storefront/limits";

const localSignature = 0x04034b50;
const centralSignature = 0x02014b50;
const eocdSignature = 0x06054b50;
const utf8Flag = 0x800;

export type ZipEntry = {
  name: string;
  bytes: Uint8Array;
};

type UnzipFailure = "invalid" | "too_large";

export type UnzipResult = { ok: true; entries: ZipEntry[] } | { ok: false; error: UnzipFailure };

export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  return zipEntries(entries, 0);
}

export function unzip(bytes: Uint8Array, maxUncompressed = maxStorefrontBytes): UnzipResult {
  if (bytes.byteLength < 22) {
    return { ok: false, error: "invalid" };
  }
  const eocd = findEocd(bytes);
  if (eocd === null) {
    return { ok: false, error: "invalid" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (count > maxStorefrontEntries || centralOffset + centralSize > bytes.byteLength) {
    return { ok: false, error: "invalid" };
  }
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== centralSignature) {
      return { ok: false, error: "invalid" };
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.byteLength) {
      return { ok: false, error: "invalid" };
    }
    const name = decodeName(bytes.subarray(nameStart, nameEnd), flags);
    cursor = nameEnd + extraLength + commentLength;
    if (name.endsWith("/")) {
      continue;
    }
    const extracted = readLocal(
      bytes,
      view,
      localOffset,
      method,
      compressedSize,
      uncompressedSize,
      maxUncompressed,
    );
    if (!extracted.ok) {
      return extracted;
    }
    total += extracted.bytes.byteLength;
    if (total > maxUncompressed) {
      return { ok: false, error: "too_large" };
    }
    entries.push({ name, bytes: extracted.bytes });
  }
  return { ok: true, entries };
}

function zipEntries(entries: readonly ZipEntry[], method: 0 | 8): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const stored = method === 8 ? deflateRawSync(entry.bytes) : entry.bytes;
    const crc = crc32(entry.bytes) >>> 0;
    const local = new Uint8Array(30 + name.length + stored.length);
    writeLocal(local, name, stored, entry.bytes.length, crc, method);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    writeCentral(central, name, stored.length, entry.bytes.length, crc, method, offset);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, eocdSignature, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  return concat([...locals, ...centrals, eocd]);
}

function writeLocal(
  local: Uint8Array,
  name: Uint8Array,
  stored: Uint8Array,
  uncompressed: number,
  crc: number,
  method: 0 | 8,
): void {
  const view = new DataView(local.buffer);
  view.setUint32(0, localSignature, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, utf8Flag, true);
  view.setUint16(8, method, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, stored.length, true);
  view.setUint32(22, uncompressed, true);
  view.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(stored, 30 + name.length);
}

function writeCentral(
  central: Uint8Array,
  name: Uint8Array,
  compressed: number,
  uncompressed: number,
  crc: number,
  method: 0 | 8,
  offset: number,
): void {
  const view = new DataView(central.buffer);
  view.setUint32(0, centralSignature, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, utf8Flag, true);
  view.setUint16(10, method, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, compressed, true);
  view.setUint32(24, uncompressed, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  central.set(name, 46);
}

function findEocd(bytes: Uint8Array): number | null {
  const start = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return null;
}

function readLocal(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  method: number,
  compressedSize: number,
  uncompressedSize: number,
  maxUncompressed: number,
): { ok: true; bytes: Uint8Array } | { ok: false; error: UnzipFailure } {
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== localSignature) {
    return { ok: false, error: "invalid" };
  }
  if (method !== 0 && method !== 8) {
    return { ok: false, error: "invalid" };
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.byteLength) {
    return { ok: false, error: "invalid" };
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (method === 0) {
    return { ok: true, bytes: compressed };
  }
  try {
    // Declared size 0 skips the length check, so the caller limit is the cap.
    const inflated = inflateRawSync(compressed, { maxOutputLength: maxUncompressed });
    if (inflated.byteLength > maxUncompressed) {
      return { ok: false, error: "too_large" };
    }
    if (inflated.byteLength !== uncompressedSize && uncompressedSize !== 0) {
      return { ok: false, error: "invalid" };
    }
    return { ok: true, bytes: inflated };
  } catch (error) {
    if (isInflateLimit(error)) {
      return { ok: false, error: "too_large" };
    }
    return { ok: false, error: "invalid" };
  }
}

function isInflateLimit(error: unknown): boolean {
  return (
    error instanceof RangeError &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE"
  );
}

function decodeName(bytes: Uint8Array, flags: number): string {
  if ((flags & utf8Flag) !== 0) {
    return new TextDecoder().decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
