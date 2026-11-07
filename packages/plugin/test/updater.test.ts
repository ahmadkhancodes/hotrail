import { buildManifest, generateSigningKeyPair, sha256Hex, signManifest } from "@buffersol/hotrail-core";
import { beforeEach, describe, expect, it } from "vitest";
import { Updater } from "../src/updater";
import type { HotrailConfig } from "../src/types";
import { addZip, CFG, FakeClock, FakeFetch, FakeNative, MemStorage } from "./helpers";

// Copied from src/lib/ship/device.ts classifyAction (the server contract). Do not import from src/.
const classify = (action: string | undefined) => {
  const a = (action ?? "").toLowerCase();
  if (a === "set" || a === "update_applied") return "applied";
  if (a === "download_complete") return "download";
  if (a === "reset" || a === "revert" || a === "rollback") return "rolledBack";
  if (a.endsWith("_fail") || a === "urlnotfound" || a === "crash") return "failed";
  return "other";
};

const enc = new TextEncoder();
let n: FakeNative, f: FakeFetch, c: FakeClock, s: MemStorage;
const mk = (cfg: Partial<HotrailConfig> = {}) => new Updater({ ...CFG, ...cfg }, { bridge: n, fetch: f.fn, clock: c, storage: s });

beforeEach(() => { n = new FakeNative(); f = new FakeFetch(); c = new FakeClock(); s = new MemStorage(); });

async function offerZip(version = "1.1.0", files: Record<string, string> = { "index.html": "<html>1.1</html>" }, checksum?: string) {
  const sum = await addZip(n, `https://cdn.test/${version}.zip`, files);
  f.update = { version, url: `https://cdn.test/${version}.zip`, checksum: checksum ?? sum };
}

describe("strategies", () => {
  it("background: downloads, stays ready, applies on background", async () => {
    await offerZip();
    const u = mk({ strategy: "background" });
    await u.onLaunch(); await u.sync();
    expect(u.state).toBe("ready");
    expect(n.reloads).toBe(0);
    expect(u.getCurrent().pending).toBe("1.1.0");
    await u.onBackground();
    expect(n.active).toBe("/b/1.1.0"); expect(n.reloads).toBe(1); expect(u.state).toBe("applied");
  });
  it("background: pending is applied at next launch", async () => {
    await offerZip();
    await mk().sync();
    const u2 = mk(); await u2.onLaunch();
    expect(n.active).toBe("/b/1.1.0"); expect(n.trial).toEqual({ previous: null, version: "1.1.0" });
  });
  it("immediate: reloads right after download", async () => {
    await offerZip();
    const u = mk({ strategy: "immediate" });
    await u.sync();
    expect(n.active).toBe("/b/1.1.0"); expect(n.reloads).toBe(1); expect(u.state).toBe("applied");
  });
  it("prompt: emits events and applies only on apply()", async () => {
    await offerZip();
    const u = mk({ strategy: "prompt" });
    const ev: string[] = [];
    u.on("updateAvailable", () => ev.push("available")); u.on("updateReady", () => ev.push("ready"));
    await u.sync();
    expect(ev).toEqual(["available", "ready"]);
    expect(n.active).toBeNull(); expect(n.reloads).toBe(0);
    expect(await u.apply()).toBe(true);
    expect(n.active).toBe("/b/1.1.0");
  });
  it("full path idle -> checking -> downloading -> verifying -> ready -> applied -> confirmed", async () => {
    await offerZip();
    const u = mk({ strategy: "immediate" }); const seen: string[] = [];
    u.on("stateChanged", (p) => seen.push(p.state as string));
    await u.sync();
    await u.notifyAppReady();
    expect(seen).toEqual(["checking", "idle", "downloading", "verifying", "ready", "applied", "confirmed"]);
  });
});

describe("download integrity and retries", () => {
  it("retries with exponential backoff then succeeds", async () => {
    await offerZip(); n.failDownloadTimes = 2;
    const u = mk({ strategy: "immediate", retryBaseDelayMs: 100 });
    await u.sync();
    expect(c.sleeps).toEqual([100, 200]);
    expect(u.state).toBe("applied");
  });
  it("gives up after maxRetries and sends download_fail", async () => {
    await offerZip(); n.failDownloadTimes = 99;
    const u = mk({ maxRetries: 2, retryBaseDelayMs: 10 });
    await u.sync(); await u.flush();
    expect(c.sleeps).toEqual([10, 20]);
    expect(n.downloads.length).toBe(3);
    expect(f.actions()).toEqual(["download_fail"]);
    expect(u.getCurrent().pending).toBeNull();
  });
  it("rejects checksum mismatch, does not retry, never re-downloads that version", async () => {
    await offerZip("1.1.0", undefined, "0".repeat(64));
    const u = mk({ strategy: "immediate" });
    await u.sync(); await u.flush();
    expect(n.active).toBeNull();
    expect(f.actions()).toEqual(["checksum_fail"]);
    expect(n.downloads.length).toBe(1);
    n.downloads.length = 0;
    expect((await u.check()).available).toBe(false);
    await u.sync();
    expect(n.downloads.length).toBe(0);
  });
});

describe("signed manifests and delta", () => {
  const files = { "index.html": "<html>v2</html>", "app.js": "console.log(2)", "big.bin": "x".repeat(500) };
  async function setup(opts: { sign?: boolean; tamper?: boolean; wrongKey?: boolean; key?: boolean } = {}) {
    const kp = await generateSigningKeyPair(); const other = await generateSigningKeyPair();
    const m = await buildManifest({
      appId: CFG.appId, version: "2.0.0", nativeFingerprint: "fp",
      files: Object.entries(files).map(([path, d]) => ({ path, data: enc.encode(d) })),
      createdAt: "2026-01-01T00:00:00Z",
    });
    const signed = await signManifest(m, kp.privateKey);
    if (opts.tamper) signed.manifest.files[0]!.sha256 = "f".repeat(64);
    f.json.set("https://cdn.test/m/2.0.0.json", signed);
    for (const d of Object.values(files)) n.server.set(`https://cdn.test/f/${await sha256Hex(enc.encode(d))}`, enc.encode(d));
    f.update = { version: "2.0.0", url: "https://cdn.test/m/2.0.0.json", checksum: "x", manifest_url: "https://cdn.test/m/2.0.0.json", files_url: "https://cdn.test/f" };
    return { pub: opts.wrongKey ? other.publicKey : kp.publicKey };
  }
  it("installs a signed manifest bundle", async () => {
    const { pub } = await setup();
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync();
    expect(n.active).toBe("/b/2.0.0");
    expect(new TextDecoder().decode(n.files.get("/b/2.0.0/app.js"))).toBe("console.log(2)");
  });
  it("rejects a tampered manifest", async () => {
    const { pub } = await setup({ tamper: true });
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync(); await u.flush();
    expect(n.active).toBeNull(); expect(f.actions()).toEqual(["signature_fail"]);
  });
  it("rejects the wrong public key", async () => {
    const { pub } = await setup({ wrongKey: true });
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync(); await u.flush();
    expect(n.active).toBeNull(); expect(f.actions()).toEqual(["signature_fail"]);
  });
  it("refuses an unsigned zip when a public key is configured", async () => {
    const { pub } = await setup();
    await offerZip();
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync(); await u.flush();
    expect(n.active).toBeNull(); expect(f.actions()).toEqual(["signature_fail"]);
  });
  it("delta: fetches only changed files, reuses unchanged from the current bundle", async () => {
    const { pub } = await setup();
    // current bundle 1.0.0 already holds index.html and big.bin unchanged, app.js differs
    n.files.set("/b/1.0.0/index.html", enc.encode(files["index.html"]));
    n.files.set("/b/1.0.0/big.bin", enc.encode(files["big.bin"]));
    n.files.set("/b/1.0.0/app.js", enc.encode("old"));
    await s.set("hotrail.state.v1", JSON.stringify({ current: { version: "1.0.0", path: "/b/1.0.0" }, pending: null, trial: null, failed: [], bundles: { "1.0.0": { version: "1.0.0", path: "/b/1.0.0" } } }));
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync();
    const appHash = await sha256Hex(enc.encode(files["app.js"]));
    expect(n.downloads).toEqual([`https://cdn.test/f/${appHash}`]);
    expect(n.active).toBe("/b/2.0.0");
  });
  it("refuses when a downloaded file does not hash to the manifest entry", async () => {
    const { pub } = await setup();
    const h = await sha256Hex(enc.encode(files["app.js"]));
    n.server.set(`https://cdn.test/f/${h}`, enc.encode("evil"));
    const u = mk({ publicKey: pub, strategy: "immediate" }); await u.sync(); await u.flush();
    expect(n.active).toBeNull(); expect(f.actions()).toEqual(["checksum_fail"]);
    expect([...n.files.keys()].some((k) => k.startsWith("/b/2.0.0"))).toBe(false);
  });
});

describe("crash revert", () => {
  async function applied() {
    await offerZip();
    const u = mk({ strategy: "immediate" }); await u.sync(); await u.flush(); f.posts.length = 0; return u;
  }
  it("confirms within the window", async () => {
    await applied();
    const u = mk(); await u.onLaunch();
    expect(u.getCurrent().trial).toBe(true);
    c.advance(5000);
    expect((await u.notifyAppReady()).confirmed).toBe(true);
    c.advance(60000);
    expect(u.state).toBe("confirmed"); expect(n.active).toBe("/b/1.1.0"); expect(n.trial).toBeNull();
  });
  it("reverts when notifyAppReady is not called within appReadyTimeoutMs", async () => {
    await applied();
    const u = mk({ appReadyTimeoutMs: 8000 }); await u.onLaunch();
    c.advance(7999); expect(n.active).toBe("/b/1.1.0");
    c.advance(1); await u.flush(); await new Promise((r) => setTimeout(r, 0)); await u.flush();
    expect(n.active).toBeNull(); expect(u.state).toBe("reverted");
    expect(f.actions()).toEqual(["rollback"]); expect(f.beacons()[0].version_name).toBe("1.1.0");
  });
  it("reverts on relaunch with an unconfirmed trial and does not re-download that version", async () => {
    await applied();
    await mk().onLaunch();           // first launch of trial bundle, app crashes before confirming
    const u = mk(); await u.onLaunch(); // second launch
    await u.flush();
    expect(n.active).toBeNull(); expect(u.state).toBe("reverted");
    expect(f.actions()).toEqual(["rollback"]);
    n.downloads.length = 0;
    await u.sync();
    expect(n.downloads.length).toBe(0);
  });
  it("reverts to the last good bundle, not the built-in one, when there is one", async () => {
    // scenario: 1.1.0 confirmed, then 1.2.0 fails
    n = new FakeNative(); f = new FakeFetch(); c = new FakeClock(); s = new MemStorage();
    await offerZip("1.1.0"); await mk({ strategy: "immediate" }).sync();
    const a = mk(); await a.onLaunch(); await a.notifyAppReady();
    await offerZip("1.2.0", { "index.html": "2" }); await mk({ strategy: "immediate" }).sync();
    await mk().onLaunch(); await mk().onLaunch();
    expect(n.active).toBe("/b/1.1.0");
  });
  it("honours a native crash guard revert", async () => {
    await applied();
    n.nativeRevert = "1.1.0";
    const u = mk(); await u.onLaunch(); await u.flush();
    expect(u.state).toBe("reverted"); expect(f.actions()).toEqual(["rollback"]);
    expect(u.getCurrent().builtin).toBe(true);
  });
});

describe("kill switch", () => {
  it("reverts to built-in and downloads nothing", async () => {
    await offerZip(); const u = mk({ strategy: "immediate" }); await u.sync();
    await mk().onLaunch(); const k = mk(); await k.init(); await k.notifyAppReady();
    n.downloads.length = 0; n.reloads = 0; f.posts.length = 0;
    f.update = { kill_switch: true, version: "9.9.9", url: "https://cdn.test/1.1.0.zip", checksum: "x" };
    const r = await k.check(); await k.flush();
    expect(r).toEqual({ available: false, killed: true });
    expect(n.active).toBeNull(); expect(n.reloads).toBe(1); expect(n.downloads).toEqual([]);
    expect(f.actions()).toEqual(["revert"]);
    expect(k.getCurrent().builtin).toBe(true);
  });
  it("sync does not download under kill", async () => {
    f.update = { kill_switch: true };
    const u = mk({ strategy: "immediate" }); await u.sync();
    expect(n.downloads).toEqual([]); expect(n.reloads).toBe(0);
  });
});

describe("beacons and robustness", () => {
  it("payload shape and classifyAction compatibility", async () => {
    await offerZip(); const u = mk({ strategy: "immediate" }); await u.sync(); await u.flush();
    const b = f.beacons();
    expect(b.map((x) => x.action)).toEqual(["download_complete", "set"]);
    expect(b.map((x) => classify(x.action))).toEqual(["download", "applied"]);
    expect(b[0]).toEqual({ action: "download_complete", app_id: CFG.appId, device_id: "dev-1", version_name: "1.1.0", version_build: "42", platform: "android" });
    expect(["download_fail", "checksum_fail", "signature_fail", "manifest_fail", "unzip_fail"].map(classify)).toEqual(Array(5).fill("failed"));
    expect(classify("rollback")).toBe("rolledBack"); expect(classify("revert")).toBe("rolledBack");
  });
  it("check request carries the protocol fields", async () => {
    await mk().check();
    expect(Object.keys(f.posts[0]!.body).sort()).toEqual(["app_id", "custom_id", "device_id", "is_emulator", "is_prod", "platform", "plugin_version", "version_build", "version_name", "version_os"]);
    expect(f.posts[0]!.body.version_name).toBe("builtin");
  });
  it("check never throws: network error, bad status, junk body", async () => {
    f.throwAll = true; expect(await mk().check()).toEqual({ available: false });
    f.throwAll = false; f.updateStatus = 500; expect(await mk().check()).toEqual({ available: false });
    f.updateStatus = 200; f.update = null; expect(await mk().check()).toEqual({ available: false });
    f.update = { version: 5 }; expect(await mk().check()).toEqual({ available: false });
    const broken = new Updater(CFG, { bridge: { ...n, getDeviceInfo: async () => { throw new Error("x"); } } as never, fetch: f.fn, clock: c, storage: s });
    expect(await broken.check()).toEqual({ available: false });
  });
  it("beacons never throw when the stats endpoint is down", async () => {
    await offerZip(); const u = mk({ strategy: "immediate" });
    await u.sync();
    f.throwAll = true;
    await expect(u.flush()).resolves.toBeUndefined();
  });
  it("no update when already on that version", async () => {
    await offerZip(); await mk({ strategy: "immediate" }).sync();
    const u = mk(); await u.init();
    expect((await u.check()).available).toBe(false);
  });
});

describe("store update (native build change)", () => {
  it("drops OTA bundles made for the old native build and goes back to the built-in assets", async () => {
    await offerZip();
    const u = mk({ strategy: "immediate" }); await u.onLaunch(); await u.sync();
    const a = mk(); await a.onLaunch(); await a.notifyAppReady(); await a.flush();
    expect(n.active).toBe("/b/1.1.0");
    f.posts.length = 0; const reloads = n.reloads;
    n.device = { ...n.device, versionBuild: "43" }; // the user installed a new store build
    const b = mk(); await b.onLaunch(); await b.flush();
    expect(n.active).toBeNull();
    expect(n.reloads).toBe(reloads + 1);
    expect(b.getCurrent()).toMatchObject({ version: "builtin", builtin: true, pending: null, trial: false });
    expect([...n.files.keys()].some((k) => k.startsWith("/b/1.1.0"))).toBe(false);
    expect(f.actions()).toEqual(["reset_native_change"]);
    expect(classify("reset_native_change")).toBe("other"); // never counted as a failure for auto-pause
    // the same version can be offered again on the new build (it was not blacklisted)
    expect((await b.check()).available).toBe(true);
  });
  it("first launch with an older plugin state just records the build, no reset", async () => {
    await offerZip();
    await mk({ strategy: "immediate" }).sync();
    const st = JSON.parse((await s.get("hotrail.state.v1"))!); delete st.nativeBuild; await s.set("hotrail.state.v1", JSON.stringify(st));
    const u = mk(); await u.onLaunch();
    expect(n.active).toBe("/b/1.1.0"); expect(u.getCurrent().trial).toBe(true);
  });
});
