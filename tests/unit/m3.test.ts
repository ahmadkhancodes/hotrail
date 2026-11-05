import { describe, expect, it } from "vitest";
import { nativeFingerprint } from "@buffersol/hotrail-core";
import { checkUpdate } from "@/lib/hotpath/check";
import { ingestStats, storePointerReader } from "@/lib/ship/device";
import { autopauseSweep } from "@/lib/ship/sweep";
import { usageSeries } from "@/lib/ship/usage";
import { BUCKET_MS, bucketStart } from "@/lib/db/types";
import { writeZip } from "@/lib/ship/zip";
import { runJobs, jobsOf } from "../../infra/cron-worker/worker";
import { harness, ORG_A } from "./helpers/ship";

const APP = "com.example.ordering";
const zipOf = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }]);
const camera = { capacitor: "8.0.0", plugins: { "@capacitor/camera": "8.2.0" } };

async function upload(h: ReturnType<typeof harness>, version: string, native = camera) {
  const fp = await nativeFingerprint(native);
  const r = await h.call("all", "POST", `bundles?appId=${APP}&version=${version}&nativeFingerprint=${fp}&native=${encodeURIComponent(JSON.stringify(native))}`, zipOf(version));
  expect(r.status).toBe(201);
  return r.body.headcode as string;
}
const release = (h: ReturnType<typeof harness>, bundle: string, percent = 100) => h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle, percent });
const ask = async (h: ReturnType<typeof harness>, build: string | undefined) =>
  checkUpdate(storePointerReader(h.deps.store), { app_id: APP, device_id: "dev-1", platform: "ios", version_name: "builtin", version_build: build });

describe("native build compatibility", () => {
  it("without recorded builds every build gets the bundle (old behaviour)", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    expect(await ask(h, "999")).toMatchObject({ version: "1.0.0" });
    expect(await ask(h, undefined)).toMatchObject({ version: "1.0.0" });
  });

  it("records fingerprints, refuses incompatible builds, and says why in release and Line", async () => {
    const h = harness();
    const hc = await upload(h, "1.0.0");
    const reg = (build: string, native: unknown) => h.call("all", "POST", "native-builds", { appId: APP, versionBuild: build, native });
    const a = await reg("41", camera);
    expect(a.status).toBe(201);
    expect(a.body.fingerprint).toBe(await nativeFingerprint(camera));
    expect((await reg("40", { capacitor: "8.0.0", plugins: {} })).status).toBe(201);

    const rel = await release(h, hc);
    expect(rel.body.incompatible).toEqual([{ build: "40", reasons: ["build 40 lacks @capacitor/camera"] }]);
    expect(await ask(h, "41")).toMatchObject({ version: "1.0.0" });
    expect(await ask(h, "40")).toEqual({ message: "no_new_version_available" });
    expect(await ask(h, "77")).toEqual({ message: "no_new_version_available" }); // unknown build: cannot be verified

    const line = (await h.call("all", "GET", `line?appId=${APP}`)).body;
    expect(line.bundles[0].incompatible).toEqual([{ build: "40", reasons: ["build 40 lacks @capacitor/camera"] }]);
    expect(line.nativeBuilds.map((b: { versionBuild: string }) => b.versionBuild).sort()).toEqual(["40", "41"]);

    // a later store build that carries the plugin is a superset: recording it republishes pointers and unlocks it
    expect((await reg("42", { capacitor: "8.1.0", plugins: { "@capacitor/camera": "8.4.0", "@capacitor/haptics": "8.0.0" } })).status).toBe(201);
    expect(await ask(h, "42")).toMatchObject({ version: "1.0.0" });

    const list = await h.call("read", "GET", `native-builds?appId=${APP}`);
    expect(list.body.builds).toHaveLength(3);
    // an upload-only key can record builds from CI, a read key cannot
    expect((await h.call("upload", "POST", "native-builds", { appId: APP, versionBuild: "43", native: camera })).status).toBe(201);
    expect((await h.call("read", "POST", "native-builds", { appId: APP, versionBuild: "44", native: camera })).status).toBe(403);
    expect((await h.call("other", "POST", "native-builds", { appId: APP, versionBuild: "45", native: camera })).status).toBe(404);
  });

  it("a bundle built for a different Capacitor major reaches no recorded build, and an explicit allow list overrides", async () => {
    const h = harness();
    await h.call("all", "POST", "native-builds", { appId: APP, versionBuild: "41", native: camera }).catch(() => undefined);
    await upload(h, "1.0.0"); // creates the app
    await h.call("all", "POST", "native-builds", { appId: APP, versionBuild: "41", native: camera });
    const hc = await upload(h, "2.0.0", { capacitor: "9.0.0", plugins: { "@capacitor/camera": "8.2.0" } });
    const rel = await release(h, hc);
    expect(rel.body.incompatible[0].reasons[0]).toContain("Capacitor 9");
    expect(await ask(h, "41")).toEqual({ message: "no_new_version_available" });
  });
});

describe("usage buckets", () => {
  it("bucket totals equal the raw events, per five minute window and overall", async () => {
    const h = harness();
    const hc = await upload(h, "1.0.0");
    await release(h, hc);
    const actions = ["download_complete", "set", "set", "update_fail", "reset", "ping"];
    let x = 7;
    const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const start = h.clock.now.getTime();
    for (let i = 0; i < 400; i++) {
      h.clock.now = new Date(start + Math.floor(rnd() * 3 * 3_600_000) - 3 * 3_600_000 / 2);
      await ingestStats(h.deps, { app_id: APP, device_id: `d${i % 50}`, version_name: i % 3 ? "1.0.0" : "0.9.0", action: actions[Math.floor(rnd() * actions.length)] });
    }
    h.clock.now = new Date(start + 2 * 3_600_000);
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const raw = await h.deps.db.listEvents(app.id, { limit: 10_000 });
    const series = await usageSeries(h.deps, { orgId: ORG_A, scope: "read", actor: "t" }, { appId: APP, hours: 24 });
    const sum = (a: "download" | "applied" | "failed" | "rolledBack") => series.points.reduce((n, p) => n + p[a], 0);
    for (const a of ["download", "applied", "failed", "rolledBack"] as const) expect(sum(a)).toBe(raw.filter((e) => e.action === a).length);
    // per window equality
    for (const p of series.points) {
      const t = new Date(p.t).getTime();
      const inWin = raw.filter((e) => bucketStart(e.ts).getTime() === t);
      expect(p.applied).toBe(inWin.filter((e) => e.action === "applied").length);
      expect(p.failed + p.rolledBack + p.download + p.applied).toBe(inWin.length);
    }
    expect(series.points).toHaveLength((24 * 3_600_000) / BUCKET_MS);
    // adoption curves: cumulative ends at the version's applied total
    for (const v of series.versions) {
      expect(v.cumulative.at(-1)).toBe(raw.filter((e) => e.action === "applied" && (e.bundleVersion ?? "builtin") === v.version).length);
    }
    expect(series.versions[0]!.headcode === "1A00" || series.versions[0]!.headcode === null).toBe(true);
  });

  it("is served over /api/v1/usage with read scope and tenant isolation", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    await ingestStats(h.deps, { app_id: APP, device_id: "d1", version_name: "1.0.0", action: "set" });
    const r = await h.call("read", "GET", `usage?appId=${APP}&hours=1`);
    expect(r.status).toBe(200);
    expect(r.body.totals.applied).toBe(1);
    expect(r.body.points).toHaveLength(12);
    expect((await h.call("other", "GET", `usage?appId=${APP}`)).status).toBe(404);
  });
});

describe("device lookup", () => {
  it("finds by device id or custom id with recent events, newest first", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    for (const [i, action] of ["download_complete", "set", "update_fail"].entries()) {
      h.clock.now = new Date(Date.parse("2026-11-05T12:00:00Z") + i * 1000);
      await ingestStats(h.deps, { app_id: APP, device_id: "dev-9", custom_id: "user-77", version_name: "1.0.0", version_build: "41", platform: "ios", action });
    }
    const byId = (await h.call("read", "GET", `devices?appId=${APP}&q=dev-9`)).body;
    const byCustom = (await h.call("read", "GET", `devices?appId=${APP}&q=user-77`)).body;
    expect(byCustom).toEqual(byId);
    expect(byId.device).toMatchObject({ deviceId: "dev-9", customId: "user-77", bundleVersion: "1.0.0", headcode: "1A00", channel: "production", versionBuild: "41", platform: "ios", override: null });
    expect(byId.events.map((e: { action: string }) => e.action)).toEqual(["failed", "applied", "download"]);
    expect((await h.call("read", "GET", `devices?appId=${APP}&q=nobody`)).body).toEqual({ found: false, events: [] });
    expect((await h.call("read", "GET", `devices?appId=${APP}&q=`)).status).toBe(400);
    expect((await h.call("other", "GET", `devices?appId=${APP}&q=dev-9`)).status).toBe(404);
  });
});

describe("bundle delete guard", () => {
  it("refuses to delete a bundle that is live or a reverse target, allows idle ones", async () => {
    const h = harness();
    const b1 = await upload(h, "1.0.0");
    const b2 = await upload(h, "1.0.1");
    const b3 = await upload(h, "1.0.2");
    await release(h, b1);
    await release(h, b2);
    const del = (b: string, key = "all") => h.call(key, "DELETE", `bundles?appId=${APP}&bundle=${b}`);
    const live = await del(b2);
    expect(live.status).toBe(409);
    expect(live.body).toMatchObject({ error: "bundle_live", details: { channels: ["production"] } });
    expect((await del(b1)).body.error).toBe("bundle_rollback_target");
    expect((await del(b3, "read")).status).toBe(403);
    expect((await del(b3, "other")).status).toBe(404);
    expect((await del(b3)).body).toEqual({ deleted: b3 });
    expect((await del(b3)).status).toBe(404);
    const list = (await h.call("all", "GET", `bundles?appId=${APP}`)).body.bundles.map((b: { headcode: string }) => b.headcode);
    expect(list).not.toContain(b3);
    // after a release moves on, the old live bundle becomes the only blocked one
    const b4 = await upload(h, "1.0.3");
    await release(h, b4);
    expect((await del(b1)).status).toBe(200);
    expect((await del(b4)).body.error).toBe("bundle_live");
  });
});

describe("auto-pause sweep", () => {
  async function seed(h: ReturnType<typeof harness>, failed: number, ok: number) {
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    for (let i = 0; i < failed + ok; i++) {
      await h.deps.db.appendEvent({
        id: `e${i}-${Math.random()}`, appId: app.id, ts: new Date(h.clock.now.getTime() - 60_000), deviceId: `d${i}`, bundleVersion: "1.0.0",
        channelId: ch.id, action: i < failed ? "failed" : "applied", cause: "x", expiresAt: new Date(h.clock.now.getTime() + 864e5),
      });
    }
    return { app, ch };
  }

  it("pauses a channel whose failures never triggered a beacon evaluation, once, and republishes the pointer", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    const { app, ch } = await seed(h, 10, 20);
    const first = await autopauseSweep(h.deps);
    expect(first.checked).toBe(1);
    expect(first.paused).toMatchObject([{ app: APP, channel: "production", sample: 30 }]);
    expect((await h.deps.db.getChannel(app.id, ch.id))!.paused).toBe(true);
    expect(await ask(h, "41")).toEqual({ message: "no_new_version_available" }); // pointer now says paused
    const second = await autopauseSweep(h.deps);
    expect(second).toMatchObject({ checked: 0, paused: [] }); // paused channels are skipped
    expect((await h.deps.db.listReleases(app.id, 10)).filter((r) => r.action === "autopause")).toHaveLength(1);
    expect(h.webhooks.some((w) => w.body.includes("channel.paused"))).toBeFalsy(); // no webhook endpoint configured in this harness
  });

  it("leaves healthy and under-sampled channels alone", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    const { app, ch } = await seed(h, 1, 40); // 2.4% under the 5% threshold
    expect((await autopauseSweep(h.deps)).paused).toEqual([]);
    expect((await h.deps.db.getChannel(app.id, ch.id))!.paused).toBe(false);
    const h2 = harness();
    await release(h2, await upload(h2, "1.0.0"));
    await seed(h2, 5, 5); // 50% but only 10 outcomes (min sample 20)
    expect((await autopauseSweep(h2.deps)).paused).toEqual([]);
  });

  it("one failing channel does not stop the sweep", async () => {
    const h = harness();
    await release(h, await upload(h, "1.0.0"));
    await seed(h, 10, 20);
    const real = h.deps.db.getAppById;
    let calls = 0;
    h.deps.db.getAppById = async (id: string) => { if (calls++ === 0) throw new Error("db blip"); return real(id); };
    const r = await autopauseSweep(h.deps);
    expect(r.errors).toBe(1);
    h.deps.db.getAppById = real;
    expect((await autopauseSweep(h.deps)).paused).toHaveLength(1);
  });
});

describe("cloudflare cron worker entry", () => {
  it("calls every job with the bearer secret, defaults to the autopause sweep first, isolates failures", async () => {
    expect(jobsOf({})).toEqual(["autopause-sweep", "webhook-retries"]);
    expect(jobsOf({ JOBS: " a, ,b " })).toEqual(["a", "b"]);
    const calls: { url: string; auth: string | null; method: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).authorization ?? null, method: String(init.method) });
      if (url.endsWith("webhook-retries")) throw new Error("network");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await runJobs({ APP_URL: "https://x.test", CRON_SECRET: "s3cret" }, fake);
    expect(res).toEqual({ "autopause-sweep": 200, "webhook-retries": 0 });
    expect(calls[0]).toEqual({ url: "https://x.test/api/cron/autopause-sweep", auth: "Bearer s3cret", method: "POST" });
    expect(calls).toHaveLength(2);
  });
});
