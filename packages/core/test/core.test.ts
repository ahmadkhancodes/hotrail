import { describe, expect, it } from "vitest";
import {
  bucketOf, buildManifest, canonicalJson, checkArchive, checkFile, compareSemver, decideUpdate,
  generateSigningKeyPair, headcodeForIndex, inRollout, isHeadcode, isSemver, manifestDigest,
  missingPlugins, nativeFingerprint, planUpload, sha256Hex, signManifest, verifyManifest, NO_UPDATE,
  type ChannelPointer,
} from "../src";

const enc = (s: string) => new TextEncoder().encode(s);

describe("hash and canonical json", () => {
  it("sha256 known vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("canonicalJson sorts keys and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[2,{"x":2,"y":1}]},"b":1}');
  });
});

describe("semver", () => {
  it("validates and orders", () => {
    expect(isSemver("2.14.1")).toBe(true);
    expect(isSemver("2.14")).toBe(false);
    expect(compareSemver("2.14.1", "2.14.0")).toBe(1);
    expect(compareSemver("1.0.0-beta.2", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-beta.2", "1.0.0-beta.10")).toBe(-1);
    expect(compareSemver("1.0.0+a", "1.0.0+b")).toBe(0);
  });
});

describe("bucketing", () => {
  it("is stable per device and channel", async () => {
    expect(await bucketOf("dev-1", "ch-1")).toBe(await bucketOf("dev-1", "ch-1"));
  });
  it("distributes within 1 percentage point over 20k ids at 25%", async () => {
    let hit = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (await inRollout(`d${i}-${(i * 2654435761) >>> 0}`, "production", 25)) hit++;
    expect(Math.abs(hit / n - 0.25)).toBeLessThan(0.01);
  });
  it("0 and 100 are absolute", async () => {
    expect(await inRollout("x", "c", 0)).toBe(false);
    expect(await inRollout("x", "c", 100)).toBe(true);
  });
  it("rollout is monotonic: devices in at 10% stay in at 50%", async () => {
    for (let i = 0; i < 500; i++) {
      const d = `dev${i}`;
      if (await inRollout(d, "c", 10)) expect(await inRollout(d, "c", 50)).toBe(true);
    }
  });
});

describe("headcode", () => {
  it("formats like 2K47 and is unique over a long run", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const h = headcodeForIndex(i);
      expect(isHeadcode(h)).toBe(true);
      expect(seen.has(h)).toBe(false);
      seen.add(h);
    }
    expect(headcodeForIndex(0)).toBe("1A00");
  });
});

describe("manifest and signing", () => {
  const files = [
    { path: "index.html", data: enc("<html></html>") },
    { path: "assets/app.js", data: enc("console.log(1)") },
  ];
  it("builds a sorted, deterministic manifest", async () => {
    const m = await buildManifest({ appId: "com.x.app", version: "2.14.1", nativeFingerprint: "abc", files, createdAt: "2026-11-05T00:00:00.000Z" });
    expect(m.files.map((f) => f.path)).toEqual(["assets/app.js", "index.html"]);
    const m2 = await buildManifest({ appId: "com.x.app", version: "2.14.1", nativeFingerprint: "abc", files: [...files].reverse(), createdAt: "2026-11-05T00:00:00.000Z" });
    expect(await manifestDigest(m)).toBe(await manifestDigest(m2));
  });
  it("rejects unsafe and duplicate paths", async () => {
    const base = { appId: "a", version: "1.0.0", nativeFingerprint: "x" };
    await expect(buildManifest({ ...base, files: [{ path: "../etc/passwd", data: enc("x") }] })).rejects.toThrow();
    await expect(buildManifest({ ...base, files: [{ path: "/abs", data: enc("x") }] })).rejects.toThrow();
    await expect(buildManifest({ ...base, files: [{ path: "a.js", data: enc("x") }, { path: "./a.js", data: enc("y") }] })).rejects.toThrow();
  });
  it("Ed25519 sign and verify; tampering and wrong key are rejected", async () => {
    const kp = await generateSigningKeyPair();
    const m = await buildManifest({ appId: "com.x.app", version: "2.14.1", nativeFingerprint: "abc", files });
    const s = await signManifest(m, kp.privateKey);
    expect(await verifyManifest(s, kp.publicKey)).toBe(true);
    const tampered = { ...s, manifest: { ...s.manifest, version: "9.9.9" } };
    expect(await verifyManifest(tampered, kp.publicKey)).toBe(false);
    const evilFiles = { ...s, manifest: { ...s.manifest, files: [{ ...s.manifest.files[0]!, sha256: "0".repeat(64) }, ...s.manifest.files.slice(1)] } };
    expect(await verifyManifest(evilFiles, kp.publicKey)).toBe(false);
    const other = await generateSigningKeyPair();
    expect(await verifyManifest(s, other.publicKey)).toBe(false);
    expect(await verifyManifest(s, "not base64!!")).toBe(false);
  });
});

describe("delta planning", () => {
  it("second upload of the same build sends under 1 percent of bytes", async () => {
    const big = new Uint8Array(2_000_000).fill(7);
    const mk = (extra: string) => buildManifest({
      appId: "a", version: "1.0.0", nativeFingerprint: "x",
      files: [{ path: "vendor.js", data: big }, { path: "index.html", data: enc(extra) }],
    });
    const first = await mk("<p>1</p>");
    const known = new Set(first.files.map((f) => f.sha256));
    const second = await mk("<p>2</p>");
    const plan = planUpload(second.files, known);
    expect(plan.reused).toBe(1);
    expect(plan.uploadRatio).toBeLessThan(0.01);
  });
  it("identical content under two paths is uploaded once", () => {
    const f = (path: string) => ({ path, sha256: "a".repeat(64), size: 10 });
    expect(planUpload([f("a.js"), f("b.js")], new Set()).missing).toHaveLength(1);
  });
});

describe("policy", () => {
  it("blocks native extensions, bundle dirs and binary magic bytes", () => {
    expect(checkFile("lib/libfoo.so", new Uint8Array([0]))?.reason).toMatch(/\.so/);
    expect(checkFile("Foo.framework/Foo", new Uint8Array([0]))?.reason).toMatch(/framework/);
    expect(checkFile("assets/renamed.bin", new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))?.reason).toMatch(/ELF/);
    expect(checkFile("assets/x.bin", new Uint8Array([0xca, 0xfe, 0xba, 0xbe]))?.reason).toMatch(/Mach-O/);
  });
  it("catches dex magic and allows ordinary web files", () => {
    expect(checkFile("a.bin", enc("dex\n035\0"))?.reason).toMatch(/dex/);
    expect(checkFile("index.html", enc("<!doctype html>"))).toBeNull();
    expect(checkFile("assets/logo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
  it("detects zip bombs", () => {
    expect(checkArchive([{ name: "a", compressedSize: 1000, uncompressedSize: 5000 }])).toBeNull();
    expect(checkArchive([{ name: "bomb", compressedSize: 1000, uncompressedSize: 900_000 }])).toMatch(/ratio/);
    expect(checkArchive(Array.from({ length: 20_001 }, (_, i) => ({ name: `f${i}`, compressedSize: 1, uncompressedSize: 1 })))).toMatch(/entries/);
  });
});

describe("native fingerprint", () => {
  it("ignores plugin order, changes with versions", async () => {
    const a = await nativeFingerprint({ capacitor: "8.0.0", plugins: { camera: "8.2.0", app: "8.0.0" } });
    const b = await nativeFingerprint({ capacitor: "8.0.0", plugins: { app: "8.0.0", camera: "8.2.0" } });
    const c = await nativeFingerprint({ capacitor: "8.0.0", plugins: { app: "8.0.0", camera: "8.1.0" } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(missingPlugins({ capacitor: "8.0.0", plugins: { camera: "8.2.0" } }, { capacitor: "8.0.0", plugins: {} })).toEqual(["camera"]);
  });
});

describe("decideUpdate (hot path logic)", () => {
  const ptr: ChannelPointer = { channelId: "production", bundleVersion: "2.14.1", url: "https://hotrail-cdn.buffersoltech.com/z/2k47.zip", checksum: "c".repeat(64), rolloutPercent: 100, paused: false, allowedNativeBuilds: ["1.8.0"] };
  const req = { app_id: "com.x.app", device_id: "dev-1", version_name: "2.14.0", version_build: "1.8.0" };
  it("serves the bundle", async () => {
    expect(await decideUpdate(ptr, req)).toEqual({ version: "2.14.1", url: ptr.url, checksum: ptr.checksum });
  });
  it("returns no update when paused, limited, missing, current, or incompatible", async () => {
    expect(await decideUpdate({ ...ptr, paused: true }, req)).toEqual(NO_UPDATE);
    expect(await decideUpdate({ ...ptr, limited: true }, req)).toEqual(NO_UPDATE);
    expect(await decideUpdate(null, req)).toEqual(NO_UPDATE);
    expect(await decideUpdate(ptr, { ...req, version_name: "2.14.1" })).toEqual(NO_UPDATE);
    expect(await decideUpdate(ptr, { ...req, version_build: "1.7.2" })).toEqual(NO_UPDATE);
    expect(await decideUpdate(ptr, { ...req, version_build: undefined })).toEqual(NO_UPDATE);
  });
  it("respects rollout and includes session_key when present", async () => {
    expect(await decideUpdate({ ...ptr, rolloutPercent: 0 }, req)).toEqual(NO_UPDATE);
    expect(await decideUpdate({ ...ptr, sessionKey: "iv:key" }, req)).toMatchObject({ session_key: "iv:key" });
  });
  it("never throws on garbage", async () => {
    expect(await decideUpdate({ ...ptr, rolloutPercent: NaN }, req)).toBeDefined();
    expect(await decideUpdate(ptr, {} as never)).toEqual(NO_UPDATE);
  });
});
