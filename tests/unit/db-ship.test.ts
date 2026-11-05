import { afterAll, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";

function shipContract(name: string, make: () => Promise<Db>) {
  describe(`ship collections contract: ${name}`, () => {
    const appDoc = (id: string, bundleId: string, orgId = "o1") => ({
      id, orgId, bundleId, name: bundleId, signingMode: "managed" as const, signingPublicKey: "pk", signingKeyEnc: "v1.x", compatMode: "native" as const,
      defaultChannelIds: {}, autopauseThreshold: 0.05, minSample: 20,
    });
    const bundleDoc = (id: string, appId: string, version: string, headcode: string, at = new Date()) => ({
      id, orgId: "o1", appId, version, headcode, nativeFingerprint: "n", manifestKey: `m/${id}`, zipKey: `z/${id}`, zipSha256: "0".repeat(64), sizeBytes: 1, fileCount: 1,
      signed: true, allowedNativeBuilds: [], delta: { baseVersion: null, changedFiles: 1, uploadBytes: 1, totalBytes: 1, uploadRatio: 1 }, createdBy: "t", state: "active" as const, createdAt: at,
    });

    it("apps: unique bundle id across orgs, per org listing, bundle counter, cascade delete and export without keys", async () => {
      const db = await make();
      await db.createApp(appDoc("a1", "com.x.one"));
      await expect(db.createApp(appDoc("a2", "com.x.one", "o2"))).rejects.toThrow("duplicate_app");
      await db.createApp(appDoc("a3", "com.x.two", "o2"));
      expect((await db.listApps("o1")).map((a) => a.id)).toEqual(["a1"]);
      expect((await db.getAppByBundleId("com.x.one"))!.orgId).toBe("o1");
      expect([await db.nextBundleSeq("a1"), await db.nextBundleSeq("a1"), await db.nextBundleSeq("a1")]).toEqual([0, 1, 2]);
      await db.createBundle(bundleDoc("b1", "a1", "1.0.0", "1A00"));
      const exp = JSON.stringify(await db.exportOrgData("o1"));
      expect(exp).toContain("com.x.one");
      expect(exp).not.toContain("v1.x"); // sealed signing key never leaves in an export
      await db.deleteOrgData("o1");
      expect(await db.getAppByBundleId("com.x.one")).toBeNull();
      expect(await db.listBundles("a1")).toEqual([]);
      expect(await db.getAppByBundleId("com.x.two")).not.toBeNull(); // other org untouched
    });

    it("bundles: unique version, lookups by headcode and version, newest first", async () => {
      const db = await make();
      await db.createApp(appDoc("a1", "com.x.one"));
      await db.createBundle(bundleDoc("b1", "a1", "1.0.0", "1A00", new Date("2026-01-01")));
      await db.createBundle(bundleDoc("b2", "a1", "1.1.0", "1A01", new Date("2026-02-01")));
      await expect(db.createBundle(bundleDoc("b3", "a1", "1.0.0", "1A02"))).rejects.toThrow("duplicate_version");
      expect((await db.listBundles("a1")).map((b) => b.headcode)).toEqual(["1A01", "1A00"]);
      expect((await db.getBundleByHeadcode("a1", "1A00"))!.id).toBe("b1");
      expect((await db.getBundleByVersion("a1", "1.1.0"))!.id).toBe("b2");
      expect(await db.getBundle("other-app", "b1")).toBeNull();
    });

    it("channels: unique name per app, compare and set on rev", async () => {
      const db = await make();
      await db.createApp(appDoc("a1", "com.x.one"));
      const ch = { id: "c1", orgId: "o1", appId: "a1", name: "production", platform: "all" as const, currentBundleId: null, previousBundleId: null, rolloutPercent: 100, autopauseThreshold: 0.05, minSample: 20, paused: false, pausedReason: null, protected: false, allowSelfAssign: false };
      const made = await db.createChannel(ch);
      expect(made.rev).toBe(0);
      await expect(db.createChannel({ ...ch, id: "c2" })).rejects.toThrow("duplicate_channel");
      const u1 = await db.updateChannel("a1", "c1", { rolloutPercent: 10 }, 0);
      expect(u1).toMatchObject({ rev: 1, rolloutPercent: 10 });
      expect(await db.updateChannel("a1", "c1", { rolloutPercent: 20 }, 0)).toBeNull();
      expect(await db.updateChannel("a1", "c1", { rolloutPercent: 30 })).toMatchObject({ rev: 2, rolloutPercent: 30 });
      expect(await db.updateChannel("other", "c1", { rolloutPercent: 1 })).toBeNull();
      expect((await db.getChannelByName("a1", "production"))!.rolloutPercent).toBe(30);
    });

    it("devices keep last seen only, counts group by version and channel, overrides and events behave", async () => {
      const db = await make();
      const t0 = new Date("2026-11-01T00:00:00Z");
      const t1 = new Date("2026-11-05T00:00:00Z");
      await db.touchDevice({ appId: "a1", deviceId: "d1", platform: "ios", bundleVersion: "1.0.0", versionBuild: "1", channelId: "c1", lastSeenAt: t0 });
      await db.touchDevice({ appId: "a1", deviceId: "d1", platform: "ios", bundleVersion: "1.1.0", versionBuild: "1", channelId: "c1", lastSeenAt: t1 });
      await db.touchDevice({ appId: "a1", deviceId: "d2", platform: "android", bundleVersion: null, versionBuild: null, channelId: "c2", lastSeenAt: t0 });
      expect(await db.countDevices("a1")).toBe(2);
      expect(await db.countDevices("a1", new Date("2026-11-03T00:00:00Z"))).toBe(1);
      expect(await db.deviceCounts("a1", "bundleVersion")).toEqual({ "1.1.0": 1, builtin: 1 });
      expect(await db.deviceCounts("a1", "channelId")).toEqual({ c1: 1, c2: 1 });
      expect((await db.getDevice("a1", "d1"))!.bundleVersion).toBe("1.1.0");

      await db.setOverride({ appId: "a1", deviceId: "d1", channelId: "c2" });
      await db.setOverride({ appId: "a1", deviceId: "d1", channelId: "c3" });
      expect((await db.getOverride("a1", "d1"))!.channelId).toBe("c3");
      expect(await db.listOverrides("a1")).toHaveLength(1);
      await db.deleteOverride("a1", "d1");
      expect(await db.getOverride("a1", "d1")).toBeNull();

      const ev = (id: string, ts: Date, channelId: string, v: string) => ({ id, appId: "a1", ts, deviceId: "d1", bundleVersion: v, channelId, action: "applied" as const, cause: "set", expiresAt: new Date(ts.getTime() + 864e5) });
      await db.appendEvent(ev("e1", t0, "c1", "1.0.0"));
      await db.appendEvent(ev("e2", t1, "c1", "1.1.0"));
      await db.appendEvent(ev("e3", t1, "c2", "1.1.0"));
      expect((await db.listEvents("a1")).map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
      expect((await db.listEvents("a1", { since: new Date("2026-11-03T00:00:00Z"), channelId: "c1" })).map((e) => e.id)).toEqual(["e2"]);
      expect((await db.listEvents("a1", { bundleVersion: "1.0.0" })).map((e) => e.id)).toEqual(["e1"]);
      expect(await db.listEvents("other")).toEqual([]);
    });

    it("releases list newest first", async () => {
      const db = await make();
      const r = (id: string, at: Date) => ({ id, orgId: "o1", appId: "a1", channelId: "c1", channelName: "production", action: "release" as const, bundleId: "b1", fromBundleId: null, percent: 100, actor: "u", cause: null, at });
      await db.appendRelease(r("r1", new Date("2026-01-01")));
      await db.appendRelease(r("r2", new Date("2026-01-02")));
      expect((await db.listReleases("a1")).map((x) => x.id)).toEqual(["r2", "r1"]);
    });
  });
}

shipContract("memory", async () => createMemoryDb("hotrail"));

const uri = process.env.MONGODB_URI_TEST;
if (uri) {
  const dbName = `hotrail_ship_test_${Date.now()}`;
  shipContract("mongo", async () => {
    const m = await import("@/lib/db/mongo");
    await m.ensureIndexes(uri, dbName);
    const c = await m.mongoClient(uri);
    await c.db(dbName).dropDatabase();
    await m.ensureIndexes(uri, dbName);
    return m.createMongoDb(uri, dbName, "hotrail");
  });
  afterAll(async () => {
    const m = await import("@/lib/db/mongo");
    const c = await m.mongoClient(uri);
    await c.db(dbName).dropDatabase();
    await c.close();
  });
}
