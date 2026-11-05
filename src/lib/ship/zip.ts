import { deflateRawSync, inflateRawSync } from "node:zlib";
import { checkArchive, type ArchiveLimits, DEFAULT_ARCHIVE_LIMITS } from "@buffersol/hotrail-core";

// Minimal zip reader and writer on node:zlib (no libraries). Node runtime only.
// Reader refuses encrypted entries, zip64 and entries whose real size disagrees with the header (zip bomb guard).

export interface ZipEntryInfo { name: string; compressedSize: number; uncompressedSize: number; method: number; offset: number }

export class ZipError extends Error {}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function listZip(zip: Uint8Array, maxEntries = DEFAULT_ARCHIVE_LIMITS.maxEntries): ZipEntryInfo[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError("not a zip file");
  const count = v.getUint16(eocd + 10, true);
  const cdOffset = v.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError("zip64 archives are not supported");
  if (count > maxEntries) throw new ZipError(`Archive has ${count} entries (limit ${maxEntries})`);
  const out: ZipEntryInfo[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > zip.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError("corrupt central directory");
    const flags = v.getUint16(p + 8, true);
    if (flags & 1) throw new ZipError("encrypted zip entries are not supported");
    const method = v.getUint16(p + 10, true);
    const compressedSize = v.getUint32(p + 20, true);
    const uncompressedSize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new ZipError("zip64 entries are not supported");
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, compressedSize, uncompressedSize, method, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readEntry(zip: Uint8Array, e: ZipEntryInfo): Uint8Array {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (e.offset + 30 > zip.length || v.getUint32(e.offset, true) !== 0x04034b50) throw new ZipError(`corrupt entry ${e.name}`);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = zip.subarray(start, start + e.compressedSize);
  if (raw.length !== e.compressedSize) throw new ZipError(`truncated entry ${e.name}`);
  let data: Uint8Array;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    try { data = new Uint8Array(inflateRawSync(raw, { maxOutputLength: e.uncompressedSize + 1 })); } catch { throw new ZipError(`entry ${e.name} is larger than its header says or corrupt`); }
  } else throw new ZipError(`unsupported compression method ${e.method}`);
  if (data.length !== e.uncompressedSize) throw new ZipError(`entry ${e.name} size mismatch`);
  return data;
}

/** Policy step 1 (before any inflate): sizes from the central directory against the archive limits. */
export function checkZip(zip: Uint8Array, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS): { entries: ZipEntryInfo[]; problem: string | null } {
  const entries = listZip(zip, limits.maxEntries).filter((e) => !e.name.endsWith("/"));
  return { entries, problem: checkArchive(entries, limits) };
}

export function writeZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.path);
    const deflated = new Uint8Array(deflateRawSync(f.data, { level: 6 }));
    const useDeflate = deflated.length < f.data.length;
    const body = useDeflate ? deflated : f.data;
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, useDeflate ? 8 : 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); // fixed 1980-01-01 so zips are reproducible
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, useDeflate ? 8 : 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
