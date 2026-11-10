import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bucketOf, sha256Hex, verifyManifest, type Manifest } from "@buffersol/hotrail-core";
import { main, type Io } from "../../packages/cli/src/cli";
import { checkUpdate } from "@/lib/hotpath/check";
import { storePointerReader } from "@/lib/ship/device";
import { BASE, harness, noise, ORG_A } from "./helpers/ship";

const APP = "com.example.ordering";

function project(version = "2.14.1", files: Record<string, Uint8Array | string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "hotrail-e2e-"));
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ version, dependencies: { "@capacitor/core": "^8.0.0", "@capacitor/camera": "^8.2.0" } }));
  writeFileSync(join(cwd, "capacitor.config.ts"), `const config = { appId: '${APP}', webDir: 'dist' };\nexport default config;`);
  mkdirSync(join(cwd, "dist"));
  const all = { "index.html": "<html><script src=app.js></script></html>", "styles.css": "body{margin:0}", "app.js": noise(1_000_000, 7), ...files };
  for (const [p, c] of Object.entries(all)) writeFileSync(join(cwd, "dist", p), c);
  return cwd;
}

function runner(cwd: string, h: ReturnType<typeof harness>, key = "all") {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { cwd, env: { HOTRAIL_API_KEY: `hr_${key}`, HOTRAIL_API_URL: BASE }, out: (s) => out.push(s), err: (s) => err.push(s), fetchImpl: h.fetch };
  return { run: (...argv: string[]) => main(argv, io), out, err, io };
}

describe("CLI against the in-process API (memory store)", () => {
  it("init, upload, release, rollback, status end to end", async () => {
    const h = harness();
    const cwd = project();
    const cli = runner(cwd, h);

    expect(await cli.run("init")).toBe(0);
    const pub = JSON.parse(readFileSync(join(cwd, ".hotrail", "signing-key.json"), "utf8")).publicKey as string;

    // upload v1: first signed upload registers the public key
    expect(await cli.run("upload")).toBe(0);
    expect(cli.out.join("\n")).toContain("Uploaded 2.14.1 as 1A00");
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    expect(app.orgId).toBe(ORG_A);
    expect(app.signingPublicKey).toBe(pub);
    const b1 = (await h.deps.db.getBundleByHeadcode(app.id, "1A00"))!;
    expect(b1.signed).toBe(true);
    const stored = JSON.parse(new TextDecoder().decode((await h.deps.store.get(b1.manifestKey))!)) as { manifest: Manifest; signature: string };
    expect(await verifyManifest({ manifest: stored.manifest, signature: stored.signature, keyId: "" }, pub)).toBe(true);

    // release at 25%: a fresh app is idle until released
    expect(await cli.run("release", "--channel", "production", "--bundle", "1A00", "--percent", "25")).toBe(0);
    expect(cli.out.at(-1)).toBe("Released 1A00 to production at 25%.");
    const ptr = JSON.parse(new TextDecoder().decode((await h.deps.store.get(`ptr/${APP}/${(await h.deps.db.getChannelByName(app.id, "production"))!.id}.json`))!));
    expect(ptr).toMatchObject({ bundleVersion: "2.14.1", rolloutPercent: 25, paused: false, headcode: "1A00", signed: true });
    const reader = storePointerReader(h.deps.store);
    let inside = "";
    let outside = "";
    for (let i = 0; !(inside && outside); i++) {
      const id = `device-${i}`;
      if ((await bucketOf(id, ptr.channelId)) < 25) inside ||= id; else outside ||= id;
    }
    const req = { app_id: APP, platform: "ios", version_name: "builtin", version_build: "1.0.0" };
    expect(await checkUpdate(reader, { ...req, device_id: inside })).toMatchObject({ version: "2.14.1", url: ptr.url, checksum: ptr.checksum });
    expect(await checkUpdate(reader, { ...req, device_id: outside })).toEqual({ message: "no_new_version_available" });
    // the checksum is the sha256 of the zip the url serves
    const zipKey = new URL(ptr.url).pathname.replace("/api/v1/files/", "");
    expect(await sha256Hex((await h.deps.store.get(zipKey))!)).toBe(ptr.checksum);

    // v2 changes one file; v3 is identical to v2
    writeFileSync(join(cwd, "dist", "styles.css"), "body{margin:1px}");
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ version: "2.14.2", dependencies: { "@capacitor/core": "^8.0.0", "@capacitor/camera": "^8.2.0" } }));
    expect(await cli.run("upload")).toBe(0);
    expect(cli.out.at(-1)).toContain("as 1A01");
    const before = { ...h.wire };
    expect(await cli.run("upload", "--version", "2.14.3")).toBe(0);
    const bytesSent = h.wire.bytes - before.bytes;
    const total = (await h.deps.db.getBundleByHeadcode(app.id, "1A02"))!.sizeBytes;
    expect(total).toBeGreaterThan(1_000_000);
    expect(bytesSent / total).toBeLessThan(0.01); // delta: only the manifest travels
    expect(h.wire.calls.slice(before.calls.length).some((c) => c.startsWith("PUT"))).toBe(false);
    const b3 = (await h.deps.db.getBundleByHeadcode(app.id, "1A02"))!;
    expect(b3.delta).toMatchObject({ baseVersion: "2.14.2", changedFiles: 0, uploadBytes: 0 });

    // release v2 fully, then reverse
    expect(await cli.run("release", "--channel", "production", "--version", "2.14.2")).toBe(0);
    expect(await cli.run("rollback", "--channel", "production")).toBe(0);
    expect(cli.out.at(-1)).toBe("Reversed production to 1A00. Devices pick it up on their next check.");
    expect(await cli.run("status")).toBe(0);
    expect(cli.out.at(-1)).toMatch(/^production\s+1A00\s+100%\s+● G live$/);
    // nothing left to reverse to
    expect(await cli.run("rollback", "--channel", "production")).toBe(1);
    expect(cli.err.join("\n")).toContain("no_previous_bundle");
  });

  it("refuses a version that already exists", async () => {
    const h = harness();
    const cwd = project("1.0.0");
    const cli = runner(cwd, h);
    await cli.run("init");
    expect(await cli.run("upload")).toBe(0);
    expect(await cli.run("upload")).toBe(1);
    expect(cli.err.join("\n")).toContain("version_exists");
  });

  it("an upload only key can upload but not release; a read key can only read", async () => {
    const h = harness();
    const cwd = project("1.0.0");
    const admin = runner(cwd, h);
    await admin.run("init");
    expect(await admin.run("upload")).toBe(0); // the first signed upload registers the key and needs the all scope
    const up = runner(cwd, h, "upload");
    expect(await up.run("upload", "--version", "1.0.1")).toBe(0);
    expect(await up.run("release", "--channel", "production", "--bundle", "1A00")).toBe(1);
    expect(up.err.join("\n")).toContain("insufficient_scope");
    expect(await up.run("status")).toBe(1);
    const rd = runner(cwd, h, "read");
    expect(await rd.run("status")).toBe(0);
    expect(await rd.run("upload", "--version", "1.0.1")).toBe(1);
    expect(rd.err.join("\n")).toContain("insufficient_scope");
  });
});

describe("CLI native build registration", () => {
  it("records the store build, then release names the builds that will not get the bundle", async () => {
    const h = harness();
    const cwd = project();
    const cli = runner(cwd, h);
    expect(await cli.run("init")).toBe(0);
    expect(await cli.run("upload")).toBe(0);
    expect(await cli.run("native", "register", "--build", "41")).toBe(0);
    expect(cli.out.at(-1)).toMatch(/^Recorded store build 41 with native fingerprint [0-9a-f]{16}\.$/);
    // an older store build whose package.json had no camera plugin
    await h.deps.db.recordNativeBuild({ appId: (await h.deps.db.getAppByBundleId(APP))!.id, versionBuild: "38", fingerprint: "old", info: { capacitor: "8.0.0", plugins: {} }, platform: "all", recordedAt: new Date() });
    expect(await cli.run("release", "--channel", "production", "--bundle", "1A00")).toBe(0);
    expect(cli.out.at(-1)).toBe("Not offered to store build 38: build 38 lacks @capacitor/camera.");
    expect(await cli.run("native", "register")).toBe(1);
    expect(await cli.run("native", "bogus")).toBe(1);
  });
});
