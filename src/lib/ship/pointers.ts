import type { ChannelPointer } from "@buffersol/hotrail-core";
import type { AppDoc } from "@/lib/db/types";
import { putJson } from "@/lib/storage/types";
import { pointerCompat } from "./native";
import { keys, type ShipDeps } from "./types";

/** Capped like docs/ARCHITECTURE.md section 2: larger sets would need per device objects. */
export const MAX_OVERRIDES = 500;

export interface PointerDoc extends ChannelPointer {
  headcode: string;
  manifestUrl: string;
  signed: boolean;
}

export interface PointerIndex {
  v: 1;
  bundleId: string;
  defaults: { ios?: string; android?: string };
  channels: Record<string, string>; // name -> channel id
  overrides: Record<string, string>; // device id -> channel id
  selfAssign: string[]; // channel ids a device may pick for itself
}

const POINTER_CACHE = "public, max-age=5";

/**
 * Rewrites every pointer for an app from the control store. This is the only writer; the hot path only reads.
 * Called after release, rollback, pause, resume, auto-pause and override changes. The index goes last so a reader
 * never sees an index that references a channel pointer that does not exist yet.
 */
export async function publishPointers(deps: ShipDeps, app: AppDoc): Promise<void> {
  const channels = await deps.db.listChannels(app.id);
  const overrides = await deps.db.listOverrides(app.id, MAX_OVERRIDES);
  const builds = await deps.db.listNativeBuilds(app.id);
  for (const ch of channels) {
    if (!ch.currentBundleId) continue;
    const b = await deps.db.getBundle(app.id, ch.currentBundleId);
    if (!b) continue;
    const doc: PointerDoc = {
      channelId: ch.id,
      bundleVersion: b.version,
      url: deps.store.publicUrl(b.zipKey),
      manifestUrl: deps.store.publicUrl(b.manifestKey),
      checksum: b.zipSha256,
      rolloutPercent: ch.rolloutPercent,
      paused: ch.paused,
      ...pointerCompat(b, builds),
      headcode: b.headcode,
      signed: b.signed,
    };
    await putJson(deps.store, keys.ptrChannel(app.bundleId, ch.id), doc, { cacheControl: POINTER_CACHE });
  }
  const index: PointerIndex = {
    v: 1,
    bundleId: app.bundleId,
    defaults: app.defaultChannelIds,
    channels: Object.fromEntries(channels.map((c) => [c.name, c.id])),
    overrides: Object.fromEntries(overrides.map((o) => [o.deviceId, o.channelId])),
    selfAssign: channels.filter((c) => c.allowSelfAssign).map((c) => c.id),
  };
  await putJson(deps.store, keys.ptrIndex(app.bundleId), index, { cacheControl: POINTER_CACHE });
}
