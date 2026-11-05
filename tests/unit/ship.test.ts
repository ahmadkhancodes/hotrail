import { describe, expect, it } from "vitest";
import { buildManifest, generateSigningKeyPair, sha256Hex, signManifest, verifyManifest, POLICY_URL } from "@buffersol/hotrail-core";
import { verifySignature } from "@/lib/webhooks/outbound";
import { open } from "@/lib/crypto/secretbox";
import { crc32, listZip, writeZip } from "@/lib/ship/zip";
import { BASE, harness, noise, ORG_A, ORG_B } from "./helpers/ship";

const APP = "com.example.ordering";
const text = (s: string) => new TextEncoder().encode(s);
const zipOf = (files: Record<string, Uint8Array | string>) => writeZip(Object.entries(files).map(([path, d]) => ({ path, data: typeof d === "string" ? text(d) : d })));
const upload = (h: ReturnType<typeof harness>, key: string, version: string, zip: Uint8Array, app = APP) =>
  h.call(key, "POST", `bundles?appId=${app}&version=${version}`, zip);

describe("zip helpers", () => {
  it("round trips and has a correct crc32", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    const z = zipOf({ "index.html": "<html></html>".repeat(50), "a/b.bin": noise(500) });
    expect(listZip(z).map((e) => e.name)).toEqual(["index.html", "a/b.bin"]);
  });
});

describe("POST /api/v1/bundles (upload pipeline)", () => {
  it("builds the manifest, signs it with the per-app managed key, stores the zip and creates the app and channel", async () => {
    const h = harness();
    const zip = zipOf({ "index.html": "<html></html>", "app.js": noise(5000) });
    const r = await upload(h, "all", "1.0.0", zip);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ headcode: "1A00", version: "1.0.0", signed: true });
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    expect(app.signingMode).toBe("managed");
    expect(app.signingKeyEnc).toMatch(/^v1\./); // private key only exists sealed
    expect(JSON.stringify(app)).not.toContain("MC4CAQAwBQYDK2VwBCIEI"); // pkcs8 ed25519 prefix in base64
    const bundle = (await h.deps.db.getBundleByHeadcode(app.id, "1A00"))!;
    const signed = JSON.parse(new TextDecoder().decode((await h.deps.store.get(bundle.manifestKey))!));
    expect(await verifyManifest({ manifest: signed.manifest, signature: signed.signature, keyId: "" }, app.signingPublicKey!)).toBe(true);
    // tampering with one hash is caught
    signed.manifest.files[0].sha256 = "0".repeat(64);
    expect(await verifyManifest({ manifest: signed.manifest, signature: signed.signature, keyId: "" }, app.signingPublicKey!)).toBe(false);
    // the stored zip is what devices download and its checksum is recorded
    expect(await sha256Hex((await h.deps.store.get(bundle.zipKey))!)).toBe(bundle.zipSha256);
    // the sealed key really is the manifest signing key
    const priv = await open(app.signingKeyEnc!, await h.deps.kek(), app.id);
    const m = await buildManifest({ appId: APP, version: "x", nativeFingerprint: "n", files: [], createdAt: "t" });
    expect(await verifyManifest(await signManifest(m, priv), app.signingPublicKey!)).toBe(true);
    // a production channel exists and is the default for both platforms
    const ch = (await h.deps.db.listChannels(app.id))[0]!;
    expect(ch.name).toBe("production");
    expect(app.defaultChannelIds).toEqual({ ios: ch.id, android: ch.id });
  });

  it("an unchanged second upload stores no new blobs and records a zero delta", async () => {
    const h = harness();
    const files = { "index.html": "<html></html>", "app.js": noise(200_000, 3) };
    const first = await upload(h, "all", "1.0.0", zipOf(files));
    expect(first.body.stats.uploadBytes).toBe(200_000 + 13);
    const second = await upload(h, "all", "1.0.1", zipOf(files));
    expect(second.body.stats).toMatchObject({ uploadBytes: 0, changedFiles: 0, uploadRatio: 0, baseVersion: "1.0.0" });
    const third = await upload(h, "all", "1.0.2", zipOf({ ...files, "index.html": "<html>x</html>" }));
    expect(third.body.stats.changedFiles).toBe(1);
    expect(third.body.stats.uploadBytes).toBe(14);
  });

  it("rejects native files by extension and by magic bytes, with the policy link", async () => {
    const h = harness();
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9]);
    const r1 = await upload(h, "all", "1.0.0", zipOf({ "index.html": "x", "lib/native.so": noise(100) }));
    expect(r1.status).toBe(422);
    expect(r1.body.error).toBe("native_file_blocked");
    expect(r1.body.details.policyUrl).toBe(POLICY_URL);
    const r2 = await upload(h, "all", "1.0.0", zipOf({ "index.html": "x", "disguised.png": elf }));
    expect(r2.status).toBe(422);
    expect(r2.body.details.violations[0]).toMatchObject({ path: "disguised.png", reason: "File content is a ELF binary" });
    expect(await h.deps.db.getAppByBundleId(APP).then((a) => a && h.deps.db.listBundles(a.id))).toEqual([]);
  });

  it("rejects zip bombs, lying headers, path traversal and non zips", async () => {
    const h = harness();
    const bomb = await upload(h, "all", "1.0.0", zipOf({ "zeros.bin": new Uint8Array(20 * 1024 * 1024) }));
    expect(bomb.status).toBe(422);
    expect(bomb.body.error).toBe("archive_rejected");
    expect(bomb.body.details.reason).toMatch(/ratio/);

    const z = zipOf({ "a.txt": "line of text number one\n".repeat(400) });
    const cd = new DataView(z.buffer).getUint32(z.length - 22 + 16, true);
    new DataView(z.buffer).setUint32(cd + 24, 10, true); // header claims 10 bytes
    const lie = await upload(h, "all", "1.0.0", z);
    expect(lie.status).toBe(422);
    expect(lie.body.error).toBe("invalid_zip");

    expect((await upload(h, "all", "1.0.0", zipOf({ "../evil.js": "x" }))).body.error).toBe("unsafe_path");
    expect((await upload(h, "all", "1.0.0", text("definitely not a zip"))).body.error).toBe("invalid_zip");
    expect((await upload(h, "all", "not semver", zipOf({ "i.html": "x" }))).body.error).toBe("invalid_version");
    expect((await upload(h, "all", "1.0.0", zipOf({ "i.html": "x" }), "bad id")).body.error).toBe("invalid_app_id");
  });

  it("bundles are immutable: the same version cannot be uploaded twice", async () => {
    const h = harness();
    expect((await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }))).status).toBe(201);
    const again = await upload(h, "all", "1.0.0", zipOf({ "i.html": "b" }));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("version_exists");
  });

  it("another org cannot touch the app or take its id, and sees no data", async () => {
    const h = harness();
    await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }));
    const taken = await upload(h, "other", "1.0.0", zipOf({ "i.html": "a" }));
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe("app_id_taken");
    expect((await h.call("other", "GET", `line?appId=${APP}`)).status).toBe(404);
    expect((await h.call("other", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A00" })).status).toBe(404);
    expect((await h.call("other", "GET", "apps")).body.apps).toEqual([]);
    expect((await h.call("all", "GET", "apps")).body.apps).toHaveLength(1);
  });

  it("the Free plan allows 2 apps", async () => {
    const h = harness();
    for (const id of ["com.a.one", "com.a.two"]) expect((await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }), id)).status).toBe(201);
    const third = await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }), "com.a.three");
    expect(third.status).toBe(402);
    expect(third.body.error).toBe("plan_limit");
  });
});

describe("plan and finalize (customer signed)", () => {
  async function plan(h: ReturnType<typeof harness>, version: string, files: Record<string, Uint8Array>, kp: { publicKey: string; privateKey: string } | null, opts: { tamper?: boolean } = {}) {
    const manifest = await buildManifest({ appId: APP, version, nativeFingerprint: "cap8", files: Object.entries(files).map(([path, data]) => ({ path, data })), createdAt: "2026-11-05T00:00:00Z" });
    const signed = kp ? await signManifest(manifest, kp.privateKey) : { manifest, signature: null };
    if (opts.tamper) signed.manifest.files[0]!.size += 1;
    return { manifest, res: await h.call("all", "POST", "upload/plan", { appId: APP, version, manifest: signed.manifest, signature: signed.signature, publicKey: kp?.publicKey }) };
  }

  it("rejects a bad signature and an unsigned upload once a key is registered", async () => {
    const h = harness();
    const kp = await generateSigningKeyPair();
    const files = { "index.html": text("<html></html>") };
    expect((await plan(h, "1.0.0", files, kp, { tamper: true })).res.body.error).toBe("bad_signature");
    expect((await plan(h, "1.0.0", files, kp)).res.status).toBe(200);
    expect((await h.deps.db.getAppByBundleId(APP))!.signingPublicKey).toBe(kp.publicKey);
    expect((await plan(h, "1.0.1", files, null)).res.body.error).toBe("unsigned_not_allowed");
    const other = await generateSigningKeyPair();
    expect((await plan(h, "1.0.1", files, other)).res.body.error).toBe("bad_signature");
  });

  it("rejects native file names in the manifest and finalize re-checks bytes (hash and magic)", async () => {
    const h = harness();
    const kp = await generateSigningKeyPair();
    expect((await plan(h, "1.0.0", { "x/libfoo.so": text("zz") }, kp)).res.body.error).toBe("native_file_blocked");

    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { manifest, res } = await plan(h, "1.0.1", { "logo.png": elf }, kp); // names look fine, bytes are not
    expect(res.body.missing).toHaveLength(1);
    const sha = manifest.files[0]!.sha256;
    const put = await h.fetch(res.body.uploads[sha].url, { method: "PUT", body: elf as BodyInit });
    expect(put.status).toBe(200);
    const fin = await h.call("all", "POST", "upload/finalize", { appId: APP, version: "1.0.1" });
    expect(fin.status).toBe(422);
    expect(fin.body.error).toBe("native_file_blocked");
  });

  it("signed blob URLs check hash, size, signature and expiry", async () => {
    const h = harness();
    const kp = await generateSigningKeyPair();
    const data = noise(300);
    const { manifest, res } = await plan(h, "1.0.0", { "a.bin": data }, kp);
    const url = res.body.uploads[manifest.files[0]!.sha256].url as string;
    expect((await h.fetch(url, { method: "PUT", body: noise(300, 9) as BodyInit })).status).toBe(422); // wrong content
    expect((await h.fetch(url, { method: "PUT", body: data.subarray(1) as BodyInit })).status).toBe(422); // wrong size
    expect((await h.fetch(url.replace(/sig=[0-9a-f]+/, "sig=" + "0".repeat(64)), { method: "PUT", body: data as BodyInit })).status).toBe(403);
    h.clock.now = new Date(h.clock.now.getTime() + 3600_000);
    expect((await h.fetch(url, { method: "PUT", body: data as BodyInit })).status).toBe(403); // expired
    h.clock.now = new Date(h.clock.now.getTime() - 3600_000);
    expect((await h.fetch(url, { method: "PUT", body: data as BodyInit })).status).toBe(200);
    // finalize without all blobs present is refused
    const { res: res2 } = await plan(h, "1.0.1", { "a.bin": data, "b.bin": noise(10, 4) }, kp);
    expect(res2.body.missing).toHaveLength(1);
    expect((await h.call("all", "POST", "upload/finalize", { appId: APP, version: "1.0.1" })).body.error).toBe("missing_blob");
  });
});

describe("scopes, roles and the audit log", () => {
  it("upload keys cannot change channels, read keys cannot write, and every action is audited with its actor", async () => {
    const h = harness();
    await upload(h, "upload", "1.0.0", zipOf({ "i.html": "a" }));
    await upload(h, "all", "1.0.1", zipOf({ "i.html": "b" }));
    const body = { appId: APP, channel: "production", bundle: "1A00" };
    for (const path of ["channels/release", "channels/rollback", "channels/pause", "channels/resume"]) {
      expect((await h.call("upload", "POST", path, body)).status, path).toBe(403);
      expect((await h.call("read", "POST", path, body)).status, path).toBe(403);
    }
    expect((await h.call("upload", "GET", `line?appId=${APP}`)).status).toBe(403);
    expect((await h.call("read", "GET", `line?appId=${APP}`)).status).toBe(200);
    expect((await h.call("read", "POST", `bundles?appId=${APP}&version=9.9.9`, zipOf({ "i.html": "z" }))).status).toBe(403);
    expect((await h.call("nobody", "GET", "apps")).status).toBe(401);

    expect((await h.call("all", "POST", "channels/release", { ...body, percent: 10 })).status).toBe(200);
    expect((await h.call("all", "POST", "channels/release", { ...body, bundle: "1A01", percent: 50 })).status).toBe(200);
    expect((await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" })).status).toBe(200);
    expect((await h.call("all", "POST", "channels/resume", { appId: APP, channel: "production" })).status).toBe(200);
    expect((await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" })).status).toBe(200);

    const log = await h.deps.db.listAudit(ORG_A, { limit: 100 });
    const actions = log.map((e) => e.action).reverse();
    expect(actions).toEqual(expect.arrayContaining(["app.created", "bundle.uploaded", "channel.released", "channel.paused", "channel.resumed", "channel.rolled_back"]));
    const released = log.find((e) => e.action === "channel.released")!;
    expect(released).toMatchObject({ actorId: "key:all", orgId: ORG_A, target: `${APP}:production` });
    expect(log.find((e) => e.action === "bundle.uploaded")!.actorId).toBe("key:upload");
    expect(log.every((e) => e.orgId === ORG_A)).toBe(true);
    expect(await h.deps.db.listAudit(ORG_B)).toEqual([]);
    // release history carries the same story
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    expect((await h.deps.db.listReleases(app.id)).map((r) => r.action).reverse()).toEqual(["release", "release", "pause", "resume", "rollback"]);
  });

  it("outbound webhooks for release, rollback and pause are HMAC signed through the kit", async () => {
    const h = harness();
    await h.deps.db.createWebhookEndpoint({ id: "ep1", orgId: ORG_A, url: "https://hooks.test/in", secret: "whsec_test", events: ["release.created", "release.rolled_back", "channel.paused"], enabled: true });
    await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }));
    await upload(h, "all", "1.0.1", zipOf({ "i.html": "b" }));
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A00" });
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A01", percent: 20 });
    await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" });
    const types = h.webhooks.map((w) => JSON.parse(w.body).type);
    expect(types).toEqual(["release.created", "release.created", "channel.paused", "release.rolled_back"]); // bundle.uploaded is not subscribed
    for (const w of h.webhooks) expect(await verifySignature("whsec_test", w.body, w.headers["x-webhook-signature"]!, h.clock.now.getTime())).toBe(true);
    expect(JSON.parse(h.webhooks[1]!.body).data).toMatchObject({ app: APP, channel: "production", headcode: "1A01", percent: 20 });
  });
});

describe("files route key whitelist", () => {
  it("memory store urls point at the public files route", async () => {
    const h = harness();
    await upload(h, "all", "1.0.0", zipOf({ "i.html": "a" }));
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const b = (await h.deps.db.listBundles(app.id))[0]!;
    expect(h.deps.store.publicUrl(b.zipKey)).toBe(`${BASE}/api/v1/files/${b.zipKey}`);
  });
});

describe("API key scope metadata", () => {
  it("defaults to all and falls back to read for anything unknown", async () => {
    const { scopeFromMetadata } = await import("@/lib/ship/guard");
    expect(scopeFromMetadata(undefined)).toBe("all");
    expect(scopeFromMetadata(null)).toBe("all");
    expect(scopeFromMetadata({})).toBe("all");
    expect(scopeFromMetadata({ scope: "upload" })).toBe("upload");
    expect(scopeFromMetadata('{"scope":"read"}')).toBe("read");
    expect(scopeFromMetadata({ scope: "root" })).toBe("read");
    expect(scopeFromMetadata("not json")).toBe("all");
  });
});
