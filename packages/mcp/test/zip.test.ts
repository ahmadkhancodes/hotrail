import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, writeZip, zipDir } from "../src/zip";

const enc = new TextEncoder();

describe("zip writer", () => {
  it("crc32 matches the known check value", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });
  it("writes a well formed STORE archive", () => {
    const z = writeZip([{ path: "a.txt", data: enc.encode("hello") }, { path: "d/b.txt", data: enc.encode("world!") }]);
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const eocd = z.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cd = v.getUint32(eocd + 16, true);
    expect(v.getUint32(cd, true)).toBe(0x02014b50);
    expect(v.getUint16(cd + 10, true)).toBe(0); // stored
    expect(v.getUint32(cd + 16, true)).toBe(crc32(enc.encode("hello")));
    expect(new TextDecoder().decode(z.subarray(30, 35))).toBe("a.txt");
  });
  it("zips a directory with forward slash paths and rejects an empty one", () => {
    const d = mkdtempSync(join(tmpdir(), "hr-mcp-"));
    expect(() => zipDir(d)).toThrow(/No files/);
    mkdirSync(join(d, "assets"));
    writeFileSync(join(d, "index.html"), "<html></html>");
    writeFileSync(join(d, "assets", "app.js"), "1");
    const z = zipDir(d);
    const s = new TextDecoder("latin1").decode(z);
    expect(s).toContain("assets/app.js");
    expect(s).toContain("index.html");
  });
});
