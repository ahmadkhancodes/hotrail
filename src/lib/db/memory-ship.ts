import type { AppDoc, BundleDoc, ChannelDoc, DeviceDoc, EventDoc, OverrideDoc, ReleaseDoc, ShipDb } from "./types";

/** Memory implementation of the ship path collections (same semantics as mongo-ship.ts). */
export function createMemoryShip(app: string): ShipDb & { deleteOrg(orgId: string): void; exportOrg(orgId: string): Record<string, unknown> } {
  const apps = new Map<string, AppDoc>();
  const bundles = new Map<string, BundleDoc>();
  const channels = new Map<string, ChannelDoc>();
  const releases: ReleaseDoc[] = [];
  const devices = new Map<string, DeviceDoc>();
  const overrides = new Map<string, OverrideDoc>();
  const events: EventDoc[] = [];
  const clone = <T>(x: T): T => structuredClone(x);
  const dk = (appId: string, deviceId: string) => `${appId}|${deviceId}`;

  return {
    async createApp(a) {
      if ([...apps.values()].some((x) => x.bundleId === a.bundleId)) throw new Error("duplicate_app");
      const doc: AppDoc = { ...clone(a), app, bundleSeq: 0, createdAt: a.createdAt ?? new Date() };
      apps.set(doc.id, doc);
      return clone(doc);
    },
    async getAppByBundleId(bundleId) {
      const a = [...apps.values()].find((x) => x.bundleId === bundleId);
      return a ? clone(a) : null;
    },
    async listApps(orgId) {
      return [...apps.values()].filter((a) => a.orgId === orgId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(clone);
    },
    async updateApp(id, patch) {
      const a = apps.get(id);
      if (a) apps.set(id, { ...a, ...clone(patch) });
    },
    async nextBundleSeq(appId) {
      const a = apps.get(appId);
      if (!a) throw new Error("app_not_found");
      const n = a.bundleSeq;
      a.bundleSeq = n + 1;
      return n;
    },

    async createBundle(b) {
      if ([...bundles.values()].some((x) => x.appId === b.appId && x.version === b.version)) throw new Error("duplicate_version");
      const doc: BundleDoc = { ...clone(b), app };
      bundles.set(doc.id, doc);
      return clone(doc);
    },
    async getBundle(appId, id) {
      const b = bundles.get(id);
      return b && b.appId === appId ? clone(b) : null;
    },
    async getBundleByVersion(appId, version) {
      const b = [...bundles.values()].find((x) => x.appId === appId && x.version === version && x.state === "active");
      return b ? clone(b) : null;
    },
    async getBundleByHeadcode(appId, headcode) {
      const b = [...bundles.values()].find((x) => x.appId === appId && x.headcode === headcode && x.state === "active");
      return b ? clone(b) : null;
    },
    async listBundles(appId, limit = 50) {
      return [...bundles.values()]
        .filter((b) => b.appId === appId && b.state === "active")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.headcode < b.headcode ? 1 : -1))
        .slice(0, limit).map(clone);
    },

    async createChannel(c) {
      if ([...channels.values()].some((x) => x.appId === c.appId && x.name === c.name)) throw new Error("duplicate_channel");
      const now = new Date();
      const doc: ChannelDoc = { ...clone(c), app, rev: 0, createdAt: now, updatedAt: now };
      channels.set(doc.id, doc);
      return clone(doc);
    },
    async getChannel(appId, id) {
      const c = channels.get(id);
      return c && c.appId === appId ? clone(c) : null;
    },
    async getChannelByName(appId, name) {
      const c = [...channels.values()].find((x) => x.appId === appId && x.name === name);
      return c ? clone(c) : null;
    },
    async listChannels(appId) {
      return [...channels.values()].filter((c) => c.appId === appId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.name < b.name ? -1 : 1)).map(clone);
    },
    async updateChannel(appId, id, patch, expectRev) {
      const c = channels.get(id);
      if (!c || c.appId !== appId) return null;
      if (expectRev !== undefined && c.rev !== expectRev) return null;
      const next: ChannelDoc = { ...c, ...clone(patch), rev: c.rev + 1, updatedAt: new Date() };
      channels.set(id, next);
      return clone(next);
    },

    async appendRelease(r) {
      releases.push(Object.freeze({ ...clone(r), app }) as ReleaseDoc);
    },
    async listReleases(appId, limit = 50) {
      return releases.filter((r) => r.appId === appId).reverse().sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit).map(clone);
    },

    async touchDevice(d) {
      devices.set(dk(d.appId, d.deviceId), { ...clone(d), app });
    },
    async getDevice(appId, deviceId) {
      const d = devices.get(dk(appId, deviceId));
      return d ? clone(d) : null;
    },
    async countDevices(appId, since) {
      return [...devices.values()].filter((d) => d.appId === appId && (!since || d.lastSeenAt >= since)).length;
    },
    async deviceCounts(appId, by, since) {
      const out: Record<string, number> = {};
      for (const d of devices.values()) {
        if (d.appId !== appId || (since && d.lastSeenAt < since)) continue;
        const v = d[by] ?? "builtin";
        out[v] = (out[v] ?? 0) + 1;
      }
      return out;
    },

    async setOverride(o) {
      overrides.set(dk(o.appId, o.deviceId), { ...o, app, at: new Date() });
    },
    async deleteOverride(appId, deviceId) {
      overrides.delete(dk(appId, deviceId));
    },
    async getOverride(appId, deviceId) {
      const o = overrides.get(dk(appId, deviceId));
      return o ? clone(o) : null;
    },
    async listOverrides(appId, limit = 500) {
      return [...overrides.values()].filter((o) => o.appId === appId).slice(0, limit).map(clone);
    },

    async appendEvent(e) {
      events.push({ ...clone(e), app });
    },
    async listEvents(appId, { since, channelId, bundleVersion, limit = 1000 } = {}) {
      return events
        .filter((e) => e.appId === appId && (!since || e.ts >= since) && (!channelId || e.channelId === channelId) && (!bundleVersion || e.bundleVersion === bundleVersion))
        .sort((a, b) => b.ts.getTime() - a.ts.getTime())
        .slice(0, limit).map(clone);
    },

    deleteOrg(orgId) {
      const appIds = new Set([...apps.values()].filter((a) => a.orgId === orgId).map((a) => a.id));
      for (const id of appIds) apps.delete(id);
      for (const [k, b] of bundles) if (b.orgId === orgId) bundles.delete(k);
      for (const [k, c] of channels) if (c.orgId === orgId) channels.delete(k);
      for (let i = releases.length - 1; i >= 0; i--) if (releases[i]!.orgId === orgId) releases.splice(i, 1);
      for (const [k, d] of devices) if (appIds.has(d.appId)) devices.delete(k);
      for (const [k, o] of overrides) if (appIds.has(o.appId)) overrides.delete(k);
      for (let i = events.length - 1; i >= 0; i--) if (appIds.has(events[i]!.appId)) events.splice(i, 1);
    },
    exportOrg(orgId) {
      const mine = [...apps.values()].filter((a) => a.orgId === orgId);
      const ids = new Set(mine.map((a) => a.id));
      return {
        apps: mine.map(({ signingKeyEnc: _k, ...rest }) => rest),
        bundles: [...bundles.values()].filter((b) => b.orgId === orgId),
        channels: [...channels.values()].filter((c) => c.orgId === orgId),
        releases: releases.filter((r) => ids.has(r.appId)),
      };
    },
  };
}
