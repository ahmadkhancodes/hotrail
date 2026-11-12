import type { Collection, Document } from "mongodb";
import { bucketStart, type AppDoc, type BundleDoc, type ChannelDoc, type DeviceDoc, type EventDoc, type NativeBuildDoc, type OverrideDoc, type ReleaseDoc, type ShipDb, type UsageBucketDoc } from "./types";

type Col = <T extends Document>(name: string) => Promise<Collection<T>>;
type Row<T> = T & { _id: string };

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;
const strip = <T>(d: (Row<T> | null)): T | null => {
  if (!d) return null;
  const { _id: _i, ...rest } = d as Record<string, unknown>;
  return rest as T;
};
const stripAll = <T>(ds: Row<T>[]): T[] => ds.map((d) => strip<T>(d)!);

/** Ship path collections on Mongo. Same semantics as memory-ship.ts. Indexes: ensureShipIndexes below. */
export function createMongoShip(col: Col, app: string): ShipDb & { deleteOrg(orgId: string): Promise<void>; exportOrg(orgId: string): Promise<Record<string, unknown>> } {
  const apps = () => col<Row<AppDoc>>("apps");
  const bundles = () => col<Row<BundleDoc>>("bundles");
  const channels = () => col<Row<ChannelDoc>>("channels");
  const releases = () => col<Row<ReleaseDoc>>("releases");
  const devices = () => col<Row<DeviceDoc>>("devices");
  const overrides = () => col<Row<OverrideDoc>>("device_overrides");
  const events = () => col<Row<EventDoc>>("events");
  const buckets = () => col<Row<UsageBucketDoc>>("usage_buckets");
  const nativeBuilds = () => col<Row<NativeBuildDoc>>("native_builds");
  const orgFlags = () => col<Row<{ app: string; orgId: string; key: string; value: string }>>("org_flags");
  const activeDevices = () => col<Row<{ app: string; orgId: string; appId: string; period: string; deviceId: string; expiresAt: Date }>>("active_devices");
  const dk = (appId: string, deviceId: string) => `${appId}|${deviceId}`;

  return {
    async listAllApps(limit = 5000) {
      return stripAll<AppDoc>(await (await apps()).find({ app }).limit(limit).toArray());
    },
    async setOrgFlag(orgId, key, value, opts) {
      const _id = `${app}|${orgId}|${key}`;
      if (opts?.ifAbsent) {
        try { await (await orgFlags()).insertOne({ _id, app, orgId, key, value }); return true; } catch (e) { if (isDup(e)) return false; throw e; }
      }
      await (await orgFlags()).updateOne({ _id }, { $set: { app, orgId, key, value } }, { upsert: true });
      return true;
    },
    async getOrgFlag(orgId, key) {
      return (await (await orgFlags()).findOne({ _id: `${app}|${orgId}|${key}` }))?.value ?? null;
    },
    async markActiveDevice(d) {
      try {
        await (await activeDevices()).insertOne({ _id: `${app}|${d.orgId}|${d.period}|${d.appId}|${d.deviceId}`, app, orgId: d.orgId, appId: d.appId, period: d.period, deviceId: d.deviceId, expiresAt: d.expiresAt });
        return true;
      } catch (e) { if (isDup(e)) return false; throw e; }
    },
    async createApp(a) {
      const doc: AppDoc = { ...a, app, bundleSeq: 0, createdAt: a.createdAt ?? new Date() };
      try { await (await apps()).insertOne({ _id: doc.id, ...doc }); } catch (e) { if (isDup(e)) throw new Error("duplicate_app"); throw e; }
      return doc;
    },
    async getAppByBundleId(bundleId) {
      if (typeof bundleId !== "string") return null; // never let an operator object become the filter
      return strip<AppDoc>(await (await apps()).findOne({ app, bundleId }));
    },
    async getAppById(id) {
      return strip<AppDoc>(await (await apps()).findOne({ _id: id, app }));
    },
    async listApps(orgId) {
      return stripAll<AppDoc>(await (await apps()).find({ app, orgId }).sort({ createdAt: 1 }).toArray());
    },
    async updateApp(id, patch) {
      await (await apps()).updateOne({ _id: id, app }, { $set: patch });
    },
    async nextBundleSeq(appId) {
      const d = await (await apps()).findOneAndUpdate({ _id: appId, app }, { $inc: { bundleSeq: 1 } }, { returnDocument: "before" });
      if (!d) throw new Error("app_not_found");
      return d.bundleSeq;
    },

    async createBundle(b) {
      const doc: BundleDoc = { ...b, app };
      try { await (await bundles()).insertOne({ _id: doc.id, ...doc }); } catch (e) { if (isDup(e)) throw new Error("duplicate_version"); throw e; }
      return doc;
    },
    async getBundle(appId, id) {
      return strip<BundleDoc>(await (await bundles()).findOne({ _id: id, app, appId }));
    },
    async getBundleByVersion(appId, version) {
      return strip<BundleDoc>(await (await bundles()).findOne({ app, appId, version, state: "active" }));
    },
    async getBundleByHeadcode(appId, headcode) {
      return strip<BundleDoc>(await (await bundles()).findOne({ app, appId, headcode, state: "active" }));
    },
    async softDeleteBundle(appId, id) {
      const r = await (await bundles()).updateOne({ _id: id, app, appId, state: "active" }, { $set: { state: "softDeleted" } });
      return r.modifiedCount === 1;
    },
    async listBundles(appId, limit = 50) {
      return stripAll<BundleDoc>(await (await bundles()).find({ app, appId, state: "active" }).sort({ createdAt: -1, headcode: -1 }).limit(limit).toArray());
    },

    async createChannel(c) {
      const now = new Date();
      const doc: ChannelDoc = { ...c, app, rev: 0, createdAt: now, updatedAt: now };
      try { await (await channels()).insertOne({ _id: doc.id, ...doc }); } catch (e) { if (isDup(e)) throw new Error("duplicate_channel"); throw e; }
      return doc;
    },
    async getChannel(appId, id) {
      return strip<ChannelDoc>(await (await channels()).findOne({ _id: id, app, appId }));
    },
    async getChannelByName(appId, name) {
      return strip<ChannelDoc>(await (await channels()).findOne({ app, appId, name }));
    },
    async listChannels(appId) {
      return stripAll<ChannelDoc>(await (await channels()).find({ app, appId }).sort({ createdAt: 1, name: 1 }).toArray());
    },
    async listLiveChannels(limit = 1000) {
      return stripAll<ChannelDoc>(await (await channels()).find({ app, currentBundleId: { $ne: null }, paused: false }).limit(limit).toArray());
    },
    async updateChannel(appId, id, patch, expectRev) {
      const filter: Document = { _id: id, app, appId };
      if (expectRev !== undefined) filter.rev = expectRev;
      const d = await (await channels()).findOneAndUpdate(filter, { $set: { ...patch, updatedAt: new Date() }, $inc: { rev: 1 } }, { returnDocument: "after" });
      return strip<ChannelDoc>(d);
    },

    async appendRelease(r) {
      await (await releases()).insertOne({ _id: r.id, ...r, app });
    },
    async listReleases(appId, limit = 50) {
      return stripAll<ReleaseDoc>(await (await releases()).find({ app, appId }).sort({ at: -1, _id: -1 }).limit(limit).toArray());
    },

    async touchDevice(d) {
      await (await devices()).replaceOne({ _id: dk(d.appId, d.deviceId) }, { ...d, app }, { upsert: true });
    },
    async getDevice(appId, deviceId) {
      return strip<DeviceDoc>(await (await devices()).findOne({ _id: dk(appId, deviceId), app }));
    },
    async getDeviceByCustomId(appId, customId) {
      return strip<DeviceDoc>(await (await devices()).findOne({ app, appId, customId }));
    },
    async countDevices(appId, since) {
      return (await devices()).countDocuments({ app, appId, ...(since ? { lastSeenAt: { $gte: since } } : {}) });
    },
    async deviceCounts(appId, by, since) {
      const rows = await (await devices()).aggregate<{ _id: string | null; n: number }>([
        { $match: { app, appId, ...(since ? { lastSeenAt: { $gte: since } } : {}) } },
        { $group: { _id: "$" + by, n: { $sum: 1 } } },
      ]).toArray();
      return Object.fromEntries(rows.map((r) => [r._id ?? "builtin", r.n]));
    },

    async setOverride(o) {
      await (await overrides()).replaceOne({ _id: dk(o.appId, o.deviceId) }, { ...o, app, at: new Date() }, { upsert: true });
    },
    async deleteOverride(appId, deviceId) {
      await (await overrides()).deleteOne({ _id: dk(appId, deviceId), app });
    },
    async getOverride(appId, deviceId) {
      return strip<OverrideDoc>(await (await overrides()).findOne({ _id: dk(appId, deviceId), app }));
    },
    async listOverrides(appId, limit = 500) {
      return stripAll<OverrideDoc>(await (await overrides()).find({ app, appId }).limit(limit).toArray());
    },

    async appendEvent(e) {
      await (await events()).insertOne({ _id: e.id, ...e, app });
    },
    async listEvents(appId, { since, channelId, bundleVersion, deviceId, limit = 1000 } = {}) {
      const q: Document = { app, appId };
      if (deviceId) q.deviceId = deviceId;
      if (since) q.ts = { $gte: since };
      if (channelId) q.channelId = channelId;
      if (bundleVersion) q.bundleVersion = bundleVersion;
      return stripAll<EventDoc>(await (await events()).find(q).sort({ ts: -1 }).limit(limit).toArray());
    },

    async bumpBucket(b) {
      const start = bucketStart(b.at);
      await (await buckets()).updateOne(
        { _id: `${b.appId}|${start.getTime()}|${b.channelId}|${b.bundleVersion}` },
        { $inc: { [`counts.${b.action}`]: 1 }, $setOnInsert: { app, appId: b.appId, bucket: start, channelId: b.channelId, bundleVersion: b.bundleVersion, expiresAt: b.expiresAt } },
        { upsert: true },
      );
    },
    async listBuckets(appId, { since, until }) {
      return stripAll<UsageBucketDoc>(await (await buckets()).find({ app, appId, bucket: { $gte: since, ...(until ? { $lt: until } : {}) } }).sort({ bucket: 1 }).toArray())
        .map((x) => ({ ...x, counts: Object.assign({ download: 0, applied: 0, failed: 0, rolledBack: 0 }, x.counts) }));
    },

    async recordNativeBuild(b) {
      await (await nativeBuilds()).replaceOne({ _id: `${b.appId}|${b.versionBuild}` }, { ...b, app }, { upsert: true });
    },
    async listNativeBuilds(appId) {
      return stripAll<NativeBuildDoc>(await (await nativeBuilds()).find({ app, appId }).sort({ recordedAt: 1 }).toArray());
    },

    async deleteOrg(orgId) {
      const appIds = (await (await apps()).find({ app, orgId }, { projection: { _id: 1 } }).toArray()).map((a) => a._id);
      await (await orgFlags()).deleteMany({ app, orgId });
      await (await activeDevices()).deleteMany({ app, orgId });
      await (await bundles()).deleteMany({ app, orgId });
      await (await channels()).deleteMany({ app, orgId });
      await (await releases()).deleteMany({ app, orgId });
      if (appIds.length) {
        await (await devices()).deleteMany({ app, appId: { $in: appIds } });
        await (await overrides()).deleteMany({ app, appId: { $in: appIds } });
        await (await events()).deleteMany({ app, appId: { $in: appIds } });
        await (await buckets()).deleteMany({ app, appId: { $in: appIds } });
        await (await nativeBuilds()).deleteMany({ app, appId: { $in: appIds } });
      }
      await (await apps()).deleteMany({ app, orgId });
    },
    async exportOrg(orgId) {
      const mine = stripAll<AppDoc>(await (await apps()).find({ app, orgId }).toArray());
      return {
        apps: mine.map(({ signingKeyEnc: _k, ...rest }) => rest),
        bundles: stripAll<BundleDoc>(await (await bundles()).find({ app, orgId }).toArray()),
        channels: stripAll<ChannelDoc>(await (await channels()).find({ app, orgId }).toArray()),
        releases: stripAll<ReleaseDoc>(await (await releases()).find({ app, orgId }).sort({ at: -1 }).limit(1000).toArray()),
      };
    },
  };
}

/** Called from ensureIndexes (npm run db:indexes). */
export async function ensureShipIndexes(d: import("mongodb").Db) {
  await d.collection("apps").createIndex({ app: 1, bundleId: 1 }, { unique: true });
  await d.collection("apps").createIndex({ app: 1, orgId: 1 });
  await d.collection("active_devices").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("active_devices").createIndex({ app: 1, orgId: 1, period: 1 });
  await d.collection("org_flags").createIndex({ app: 1, orgId: 1 });
  await d.collection("bundles").createIndex({ appId: 1, version: 1 }, { unique: true });
  await d.collection("bundles").createIndex({ appId: 1, headcode: 1 }, { unique: true });
  await d.collection("bundles").createIndex({ app: 1, orgId: 1 });
  await d.collection("bundles").createIndex({ appId: 1, createdAt: -1 });
  await d.collection("channels").createIndex({ appId: 1, name: 1 }, { unique: true });
  await d.collection("channels").createIndex({ app: 1, orgId: 1 });
  await d.collection("releases").createIndex({ appId: 1, at: -1 });
  await d.collection("releases").createIndex({ app: 1, orgId: 1 });
  await d.collection("devices").createIndex({ appId: 1, lastSeenAt: -1 });
  await d.collection("device_overrides").createIndex({ appId: 1 });
  await d.collection("events").createIndex({ appId: 1, ts: -1 });
  await d.collection("events").createIndex({ appId: 1, channelId: 1, ts: -1 });
  await d.collection("events").createIndex({ appId: 1, deviceId: 1, ts: -1 });
  await d.collection("devices").createIndex({ appId: 1, customId: 1 }, { sparse: true });
  await d.collection("channels").createIndex({ app: 1, paused: 1, currentBundleId: 1 });
  await d.collection("usage_buckets").createIndex({ appId: 1, bucket: 1 });
  await d.collection("usage_buckets").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("native_builds").createIndex({ appId: 1 });
  await d.collection("events").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
