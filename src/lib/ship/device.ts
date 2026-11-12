import type { AppDoc, EventAction } from "@/lib/db/types";
import { resolveChannel, type PointerReader } from "@/lib/hotpath/check";
import { HttpError } from "@/lib/http";
import { getJson } from "@/lib/storage/types";
import type { BundleStore } from "@/lib/storage/types";
import { publishPointers, MAX_OVERRIDES } from "./pointers";
import { eventRetentionDays } from "@/lib/billing/limits";
import { evaluateAutopause } from "./release";
import { BUCKET_TTL_DAYS } from "@/lib/db/types";
import { uuidv7 } from "@/lib/ids";
import type { ShipDeps } from "./types";

export const storePointerReader = (store: Pick<BundleStore, "get">): PointerReader => ({
  readJson: <T,>(key: string) => getJson<T>(store as BundleStore, key),
});

/** Hot path reader: short in-process cache (a few seconds) so repeated checks skip R2; a pause reaches devices within the TTL. */
export function cachedPointerReader(store: Pick<BundleStore, "get">, ttlMs = 3000, now: () => number = Date.now): PointerReader {
  const inner = storePointerReader(store);
  const memo = new Map<string, { at: number; v: Promise<unknown> }>();
  return {
    readJson: <T,>(key: string) => {
      const t = now();
      const hit = memo.get(key);
      if (hit && t - hit.at < ttlMs) return hit.v as Promise<T | null>;
      const v = inner.readJson<T>(key);
      memo.set(key, { at: t, v });
      if (memo.size > 5000) memo.clear();
      v.catch(() => { if (memo.get(key)?.v === v) memo.delete(key); }); // never cache a failure
      return v;
    },
  };
}

export interface StatsBeacon {
  action?: string;
  app_id?: string;
  device_id?: string;
  version_name?: string;
  version_build?: string;
  platform?: string;
  custom_id?: string;
}

/** Map the plugin's free-form action names (public protocol docs) to the few outcomes we count. */
export function classifyAction(action: string | undefined): EventAction {
  const a = (action ?? "").toLowerCase();
  if (a === "set" || a === "update_applied") return "applied";
  if (a === "download_complete") return "download";
  if (a === "reset" || a === "revert" || a === "rollback") return "rolledBack";
  if (a.endsWith("_fail") || a === "urlnotfound" || a === "crash") return "failed";
  return "other";
}

/**
 * Beacon ingest (`statsUrl`). Always succeeds from the device's point of view. Registers last seen, stores outcome
 * events, and re-evaluates auto-pause after a failure. Runs on the Node runtime (it writes to the DB).
 */
export async function ingestStats(deps: ShipDeps, raw: StatsBeacon): Promise<{ stored: boolean }> {
  const b = cleanBeacon(raw);
  if (!b.app_id || !b.device_id || b.device_id.length > 128) return { stored: false };
  const app = await deps.db.getAppByBundleId(b.app_id);
  if (!app) return { stored: false };
  const reader = storePointerReader(deps.store);
  const r = await resolveChannel(reader, { app_id: b.app_id, device_id: b.device_id, platform: b.platform });
  const now = deps.now();
  await deps.db.touchDevice({
    appId: app.id, deviceId: b.device_id, platform: b.platform ?? "unknown", customId: b.custom_id ? String(b.custom_id).slice(0, 128) : null,
    bundleVersion: b.version_name ?? null, versionBuild: b.version_build ?? null, channelId: r.channelId, lastSeenAt: now,
  });
  const action = classifyAction(b.action);
  if (action === "other") return { stored: false };
  // Raw events are kept for as many days as the org's plan includes (7 Free, 30 Solo, 60 Maker, 90 Team).
  const keepDays = await eventRetentionDays(deps.db, app.orgId, now);
  await deps.db.appendEvent({
    id: uuidv7(), appId: app.id, ts: now, deviceId: b.device_id, bundleVersion: b.version_name ?? null, channelId: r.channelId,
    action, cause: String(b.action).slice(0, 64), expiresAt: new Date(now.getTime() + keepDays * 864e5),
  });
  // The adoption bucket counts exactly the events stored above (one increment per stored event), so charts match raw counts.
  await deps.db.bumpBucket({ appId: app.id, at: now, channelId: r.channelId, bundleVersion: b.version_name ?? null, action, expiresAt: new Date(now.getTime() + BUCKET_TTL_DAYS * 864e5) });
  if ((action === "failed" || action === "rolledBack") && r.channelId) await evaluateAutopause(deps, app, r.channelId);
  return { stored: true };
}

export interface DeviceChannelRequest { app_id?: string; device_id?: string; channel?: string; platform?: string }

/**
 * Device endpoints are unauthenticated and take raw JSON. A non-string field such as `{"$regex": "^com\\.victim"}` used to
 * reach Mongo as a query operator and select another customer's app, device or override (SECURITY-REVIEW S-1).
 * Only strings survive, with bounded lengths; anything else is dropped.
 */
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const DEVICE_FIELDS: Record<keyof StatsBeacon | "channel", number> = {
  action: 64, app_id: 128, device_id: 128, version_name: 64, version_build: 32, platform: 16, custom_id: 128, channel: 32,
};
function cleanFields<T extends object>(raw: unknown, fields: readonly (keyof typeof DEVICE_FIELDS)[]): T {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = str(src[f], DEVICE_FIELDS[f]);
    if (v !== undefined) out[f] = v;
  }
  return out as T;
}
export const cleanBeacon = (raw: unknown): StatsBeacon =>
  cleanFields<StatsBeacon>(raw, ["action", "app_id", "device_id", "version_name", "version_build", "platform", "custom_id"]);
export const cleanChannelRequest = (raw: unknown): DeviceChannelRequest =>
  cleanFields<DeviceChannelRequest>(raw, ["app_id", "device_id", "channel", "platform"]);

export async function getDeviceChannel(deps: ShipDeps, raw: DeviceChannelRequest): Promise<{ channel: string | null; status: "default" | "override" | "none"; allowSet: boolean }> {
  const q = cleanChannelRequest(raw);
  if (!q.app_id || !q.device_id) return { channel: null, status: "none", allowSet: false };
  const app = await deps.db.getAppByBundleId(q.app_id);
  if (!app) return { channel: null, status: "none", allowSet: false };
  const r = await resolveChannel(storePointerReader(deps.store), { app_id: q.app_id, device_id: q.device_id, platform: q.platform });
  const channels = await deps.db.listChannels(app.id);
  const ch = channels.find((c) => c.id === r.channelId);
  return { channel: ch?.name ?? null, status: r.source === "none" ? "none" : r.source, allowSet: channels.some((c) => c.allowSelfAssign) };
}

/** Device picks its own channel, only when the channel allows self assignment. Dashboard overrides use setOverride below. */
export async function selfAssignChannel(deps: ShipDeps, raw: DeviceChannelRequest): Promise<{ status: "ok"; channel: string }> {
  const q = cleanChannelRequest(raw);
  if (!q.app_id || !q.device_id || !q.channel) throw new HttpError(400, "invalid_input");
  const app = await deps.db.getAppByBundleId(q.app_id);
  if (!app) throw new HttpError(404, "app_not_found");
  const ch = await deps.db.getChannelByName(app.id, q.channel);
  if (!ch) throw new HttpError(404, "channel_not_found");
  if (!ch.allowSelfAssign) throw new HttpError(403, "self_assign_not_allowed", { message: "This channel does not allow devices to choose it." });
  // Unauthenticated endpoint: a repeat must not cost a full pointer republish.
  if ((await deps.db.getOverride(app.id, q.device_id))?.channelId === ch.id) return { status: "ok", channel: ch.name };
  await setOverride(deps, app, q.device_id, ch.id);
  return { status: "ok", channel: ch.name };
}

export async function clearDeviceChannel(deps: ShipDeps, raw: DeviceChannelRequest): Promise<{ status: "ok" }> {
  const q = cleanChannelRequest(raw);
  if (!q.app_id || !q.device_id) throw new HttpError(400, "invalid_input");
  const app = await deps.db.getAppByBundleId(q.app_id);
  if (!app) throw new HttpError(404, "app_not_found");
  if (!(await deps.db.getOverride(app.id, q.device_id))) return { status: "ok" }; // nothing to clear, nothing to republish
  await deps.db.deleteOverride(app.id, q.device_id);
  await publishPointers(deps, app);
  return { status: "ok" };
}

export async function setOverride(deps: ShipDeps, app: AppDoc, deviceId: string, channelId: string): Promise<void> {
  const current = await deps.db.listOverrides(app.id, MAX_OVERRIDES + 1);
  if (!current.some((o) => o.deviceId === deviceId) && current.length >= MAX_OVERRIDES) {
    throw new HttpError(409, "override_limit", { limit: MAX_OVERRIDES });
  }
  await deps.db.setOverride({ appId: app.id, deviceId, channelId });
  await publishPointers(deps, app);
}
