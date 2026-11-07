import { describe, expect, it } from "vitest";
import { bucketOf, inRollout, NO_UPDATE } from "@buffersol/hotrail-core";
import { checkUpdate } from "@/lib/hotpath/check";
import { classifyAction, ingestStats, storePointerReader } from "@/lib/ship/device";
import { writeZip } from "@/lib/ship/zip";
import { evaluateAutopause, AUTOPAUSE_WINDOW_MS } from "@/lib/ship/release";
import { harness, ORG_A } from "./helpers/ship";

const APP = "com.example.ordering";
const zip = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(body) }]);

async function seeded(opts: { nativeBuilds?: string } = {}) {
  const h = harness();
  await h.call("all", "POST", `bundles?appId=${APP}&version=1.0.0${opts.nativeBuilds ? `&nativeBuilds=${opts.nativeBuilds}` : ""}`, zip("one"));
  await h.call("all", "POST", `bundles?appId=${APP}&version=1.1.0${opts.nativeBuilds ? `&nativeBuilds=${opts.nativeBuilds}` : ""}`, zip("two"));
  const app = (await h.deps.db.getAppByBundleId(APP))!;
  const reader = storePointerReader(h.deps.store);
  const check = (device: string, extra: Record<string, unknown> = {}) =>
    checkUpdate(reader, { app_id: APP, device_id: device, platform: "ios", version_name: "builtin", version_build: "1.8.0", ...extra } as never);
  const release = (bundle: string, percent = 100, channel = "production") => h.call("all", "POST", "channels/release", { appId: APP, channel, bundle, percent });
  return { h, app, reader, check, release };
}

describe("update hot path decisions", () => {
  it("serves the Capgo protocol response shape and nothing else when there is nothing to serve", async () => {
    const { check, release } = await seeded();
    expect(await check("d1")).toEqual(NO_UPDATE); // nothing released yet
    await release("1A00");
    const res = (await check("d1")) as { version: string; url: string; checksum: string };
    expect(Object.keys(res).sort()).toEqual(["checksum", "files_url", "manifest_url", "url", "version"]);
    expect(res.version).toBe("1.0.0");
    expect(res.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(res.url).toContain("/api/v1/files/zips/");
    expect(await check("d1", { version_name: "1.0.0" })).toEqual(NO_UPDATE); // already there
  });

  it("answers no update for unknown apps, garbage bodies and a failing pointer store, never throwing", async () => {
    const { check, release } = await seeded();
    await release("1A00");
    expect(await check("d1", { app_id: "com.unknown.app" })).toEqual(NO_UPDATE);
    expect(await check("d1", { app_id: "../../etc/passwd" })).toEqual(NO_UPDATE);
    expect(await checkUpdate(storePointerReader({ get: async () => { throw new Error("r2 down"); } }), { app_id: APP, device_id: "d" })).toEqual(NO_UPDATE);
    expect(await checkUpdate(storePointerReader({ get: async () => new TextEncoder().encode("{not json") }), { app_id: APP, device_id: "d" })).toEqual(NO_UPDATE);
    for (const bad of [null, undefined, 5, "x", {}, { app_id: APP }, { device_id: "x" }]) expect(await checkUpdate(storePointerReader({ get: async () => null }), bad as never)).toEqual(NO_UPDATE);
  });

  it("keeps serving from pointers when the control database is gone", async () => {
    const { h, release, check } = await seeded();
    await release("1A00");
    for (const k of Object.keys(h.deps.db) as (keyof typeof h.deps.db)[]) if (typeof h.deps.db[k] === "function") (h.deps.db as never as Record<string, unknown>)[k] = async () => { throw new Error("mongo blocked"); };
    expect(((await check("d1")) as { version: string }).version).toBe("1.0.0");
  });

  it("native build compatibility: incompatible devices get no update", async () => {
    const { check, release } = await seeded({ nativeBuilds: "1.8.0,1.8.1" });
    await release("1A00");
    expect(await check("d1", { version_build: "1.7.2" })).toEqual(NO_UPDATE);
    expect(await check("d1", { version_build: undefined })).toEqual(NO_UPDATE);
    expect(((await check("d1", { version_build: "1.8.1" })) as { version: string }).version).toBe("1.0.0");
  });

  it("pause stops delivery, resume restores it", async () => {
    const { h, check, release } = await seeded();
    await release("1A00");
    await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    expect(await check("d1")).toEqual(NO_UPDATE);
    await h.call("all", "POST", "channels/resume", { appId: APP, channel: "production" });
    expect(((await check("d1")) as { version: string }).version).toBe("1.0.0");
  });

  it("platform defaults and per device overrides (self assignment only where the channel allows it)", async () => {
    const { h, app, check, release } = await seeded();
    await release("1A00");
    await release("1A01", 0, "beta"); // beta at 0%: nobody gets it by rollout
    expect(await check("dev-1")).toMatchObject({ version: "1.0.0" });
    const beta = (await h.deps.db.getChannelByName(app.id, "beta"))!;

    const post = (channel: string) => import("@/lib/ship/device").then((m) => m.selfAssignChannel(h.deps, { app_id: APP, device_id: "dev-1", channel }));
    await expect(post("beta")).rejects.toMatchObject({ code: "self_assign_not_allowed" });
    await expect(post("nope")).rejects.toMatchObject({ code: "channel_not_found" });
    await h.deps.db.updateChannel(app.id, beta.id, { allowSelfAssign: true });
    await post("beta");
    // override bypasses the rollout percent of the target channel, other devices are unaffected
    expect(await check("dev-1")).toMatchObject({ version: "1.1.0" });
    expect(await check("dev-2")).toMatchObject({ version: "1.0.0" });
    const { getDeviceChannel, clearDeviceChannel } = await import("@/lib/ship/device");
    expect(await getDeviceChannel(h.deps, { app_id: APP, device_id: "dev-1", platform: "ios" })).toMatchObject({ channel: "beta", status: "override" });
    await clearDeviceChannel(h.deps, { app_id: APP, device_id: "dev-1" });
    expect(await check("dev-1")).toMatchObject({ version: "1.0.0" });
    expect(await getDeviceChannel(h.deps, { app_id: APP, device_id: "dev-1", platform: "ios" })).toMatchObject({ channel: "production", status: "default" });
  });
});

describe("sticky rollout bucketing", () => {
  it("is stable per device, monotonic as the percent rises, and within 1% over 100k synthetic ids", async () => {
    const channelId = "chan-1";
    const ids = Array.from({ length: 100_000 }, (_, i) => `device-${i}-${(i * 2654435761) >>> 0}`);
    const buckets = await Promise.all(ids.map((id) => bucketOf(id, channelId)));
    for (const pct of [10, 30, 50, 90]) {
      const share = (buckets.filter((b) => b < pct).length / ids.length) * 100;
      expect(Math.abs(share - pct), `${pct}%`).toBeLessThan(1);
    }
    expect(await Promise.all(ids.slice(0, 500).map((id) => bucketOf(id, channelId)))).toEqual(buckets.slice(0, 500));
    for (const id of ids.slice(0, 500)) {
      if (await inRollout(id, channelId, 10)) expect(await inRollout(id, channelId, 50)).toBe(true);
    }
    // a different channel buckets the same device differently
    const other = await Promise.all(ids.slice(0, 2000).map((id) => bucketOf(id, "chan-2")));
    expect(other.filter((b, i) => b === buckets[i]).length).toBeLessThan(100);
  });

  it("through the hot path a 30% rollout serves about 30% of devices and never flaps", async () => {
    const { check, release } = await seeded();
    await release("1A00", 30);
    const ids = Array.from({ length: 2000 }, (_, i) => `hp-${i}`);
    const first = await Promise.all(ids.map(async (id) => "version" in (await check(id))));
    const share = first.filter(Boolean).length / ids.length;
    expect(share).toBeGreaterThan(0.26);
    expect(share).toBeLessThan(0.34);
    expect(await Promise.all(ids.map(async (id) => "version" in (await check(id))))).toEqual(first);
  });
});

describe("stats beacons and auto-pause", () => {
  const beacon = (action: string, device: string, extra: Record<string, unknown> = {}) => ({ app_id: APP, device_id: device, action, version_name: "1.0.0", version_build: "1.8.0", platform: "ios", ...extra });

  it("maps plugin actions to outcomes", () => {
    expect(classifyAction("set")).toBe("applied");
    expect(classifyAction("download_complete")).toBe("download");
    expect(["update_fail", "download_fail", "checksum_fail", "unzip_fail", "decrypt_fail", "urlNotFound"].map(classifyAction)).toEqual(Array(6).fill("failed"));
    expect(classifyAction("reset")).toBe("rolledBack");
    expect(["ping", "get", "download_10", undefined].map((a) => classifyAction(a))).toEqual(Array(4).fill("other"));
  });

  it("stores last seen per device and outcome events, ignoring noise and unknown apps", async () => {
    const { h, app } = await seeded();
    expect(await ingestStats(h.deps, beacon("ping", "d1"))).toEqual({ stored: false });
    expect(await ingestStats(h.deps, beacon("set", "d1"))).toEqual({ stored: true });
    expect(await ingestStats(h.deps, beacon("set", "d1", { app_id: "com.nope.app" }))).toEqual({ stored: false });
    expect(await ingestStats(h.deps, { app_id: APP })).toEqual({ stored: false });
    expect(await h.deps.db.getDevice(app.id, "d1")).toMatchObject({ bundleVersion: "1.0.0", versionBuild: "1.8.0", platform: "ios" });
    expect(await h.deps.db.listEvents(app.id)).toHaveLength(1);
    expect(await h.deps.db.countDevices(app.id)).toBe(1);
  });

  it("pauses the channel when the failure rate passes the threshold, with release record, audit entry, webhook and pointer", async () => {
    const { h, app, release, check } = await seeded();
    await h.deps.db.createWebhookEndpoint({ id: "ep", orgId: ORG_A, url: "https://hooks.test/x", secret: "whsec_a", events: ["channel.paused"], enabled: true });
    await release("1A00");
    for (let i = 0; i < 30; i++) await ingestStats(h.deps, beacon("set", `ok-${i}`));
    for (let i = 0; i < 2; i++) await ingestStats(h.deps, beacon("update_fail", `bad-${i}`)); // 2/32 = 6.25% > 5%
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    expect(ch.paused).toBe(true);
    expect(ch.pausedReason).toMatch(/^autopause: 6\.3% failures over 32 outcomes/);
    expect(await check("new-device")).toEqual(NO_UPDATE);
    const releases = await h.deps.db.listReleases(app.id);
    expect(releases[0]).toMatchObject({ action: "autopause", actor: "system" });
    const audit = (await h.deps.db.listAudit(ORG_A)).find((a) => a.action === "channel.autopaused")!;
    expect(audit).toMatchObject({ actorId: null, target: `${APP}:production` });
    expect(h.webhooks.map((w) => JSON.parse(w.body).type)).toEqual(["channel.paused"]);
    // already paused: further failures do not pile up releases
    await ingestStats(h.deps, beacon("update_fail", "bad-9"));
    expect((await h.deps.db.listReleases(app.id)).filter((r) => r.action === "autopause")).toHaveLength(1);
  });

  it("does not pause below the minimum sample or at exactly the threshold, and ignores old events", async () => {
    const { h, app, release } = await seeded();
    await release("1A00");
    for (let i = 0; i < 5; i++) await ingestStats(h.deps, beacon("update_fail", `f-${i}`)); // 100% but only 5 outcomes
    expect((await h.deps.db.getChannelByName(app.id, "production"))!.paused).toBe(false);
    for (let i = 0; i < 95; i++) await ingestStats(h.deps, beacon("set", `s-${i}`)); // 5/100 = exactly 5%
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    expect(await evaluateAutopause(h.deps, app, ch.id)).toMatchObject({ paused: false, sample: 100, rate: 0.05 });
    h.clock.now = new Date(h.clock.now.getTime() + AUTOPAUSE_WINDOW_MS + 1000);
    for (let i = 0; i < 25; i++) await ingestStats(h.deps, beacon("set", `late-${i}`)); // the failures fell out of the window
    expect(await evaluateAutopause(h.deps, app, ch.id)).toMatchObject({ paused: false, sample: 25, rate: 0 });
  });

  it("uses the threshold passed at release time", async () => {
    const { h, app } = await seeded();
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A00", autopauseThreshold: 0.5 });
    for (let i = 0; i < 20; i++) await ingestStats(h.deps, beacon("set", `s-${i}`));
    for (let i = 0; i < 10; i++) await ingestStats(h.deps, beacon("update_fail", `f-${i}`)); // 33% < 50%
    expect((await h.deps.db.getChannelByName(app.id, "production"))!.paused).toBe(false);
  });
});

describe("rollback and release concurrency", () => {
  it("one click rollback restores the previous bundle at 100% and updates the pointer", async () => {
    const { h, app, release, check } = await seeded();
    await release("1A00");
    await release("1A01", 25);
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    expect(ch).toMatchObject({ rolloutPercent: 25 });
    const rb = await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" });
    expect(rb.body).toMatchObject({ headcode: "1A00", percent: 100, action: "rollback" });
    for (const d of ["a", "b", "c", "d"]) expect(await check(d, { version_name: "1.1.0" })).toMatchObject({ version: "1.0.0" });
    expect(await check("a", { version_name: "1.0.0" })).toEqual(NO_UPDATE);
    expect((await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" })).body.error).toBe("no_previous_bundle");
    expect((await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "ghost" })).body.error).toBe("channel_not_found");
  });

  it("rollback also lifts a pause, and re-releasing the live bundle only moves the percent", async () => {
    const { h, app, release } = await seeded();
    await release("1A00");
    await release("1A01", 10);
    await release("1A01", 60);
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    expect(ch).toMatchObject({ rolloutPercent: 60 });
    const [live, prev] = [await h.deps.db.getBundle(app.id, ch.currentBundleId!), await h.deps.db.getBundle(app.id, ch.previousBundleId!)];
    expect([live!.headcode, prev!.headcode]).toEqual(["1A01", "1A00"]); // previous is still the older bundle
    await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" });
    expect(await h.deps.db.getChannelByName(app.id, "production")).toMatchObject({ paused: false, rolloutPercent: 100 });
  });

  it("a stale revision cannot overwrite a newer release (compare and set)", async () => {
    const { h, app } = await seeded();
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A00" });
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    expect(await h.deps.db.updateChannel(app.id, ch.id, { rolloutPercent: 5 }, ch.rev)).not.toBeNull();
    expect(await h.deps.db.updateChannel(app.id, ch.id, { rolloutPercent: 99 }, ch.rev)).toBeNull();
    expect((await h.deps.db.getChannel(app.id, ch.id))!.rolloutPercent).toBe(5);
  });

  it("validates release input", async () => {
    const { h } = await seeded();
    const r = (body: object) => h.call("all", "POST", "channels/release", { appId: APP, channel: "production", ...body });
    expect((await r({ bundle: "1A00", percent: 101 })).status).toBe(400);
    expect((await r({})).body.error).toBe("bundle_required");
    expect((await r({ bundle: "9Z99" })).body.error).toBe("bundle_not_found");
    expect((await h.call("all", "POST", "channels/release", { appId: APP, channel: "Bad Name", bundle: "1A00" })).body.error).toBe("invalid_channel");
  });
});

describe("line view payload", () => {
  it("reports channels with lamps, bundles with adoption, and releases", async () => {
    const { h, release } = await seeded();
    await release("1A00");
    await release("1A01", 25);
    for (let i = 0; i < 3; i++) await ingestStats(h.deps, { app_id: APP, device_id: `a${i}`, action: "set", version_name: "1.0.0", platform: "ios" });
    await ingestStats(h.deps, { app_id: APP, device_id: "b0", action: "set", version_name: "1.1.0", platform: "ios" });
    const line = (await h.call("read", "GET", `line?appId=${APP}`)).body;
    expect(line.channels).toHaveLength(1);
    expect(line.channels[0]).toMatchObject({ name: "production", headcode: "1A01", previousHeadcode: "1A00", percent: 25, lamp: "amber", devices: 4 });
    const b = Object.fromEntries(line.bundles.map((x: { headcode: string }) => [x.headcode, x]));
    expect(b["1A00"]).toMatchObject({ devices: 3, adoption: 0.75, signed: true });
    expect(b["1A01"]).toMatchObject({ devices: 1, adoption: 0.25, channels: ["production"] });
    expect(line.releases.map((r: { action: string }) => r.action)).toEqual(["release", "release"]);
    await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    expect((await h.call("read", "GET", `line?appId=${APP}`)).body.channels[0].lamp).toBe("red");
  });
});
