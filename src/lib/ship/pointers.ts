import type { ChannelPointer } from "@buffersol/hotrail-core";
import type { AppDoc } from "@/lib/db/types";
import { putJson } from "@/lib/storage/types";
import { orgLimited } from "@/lib/billing/limits";
import { pointerCompat } from "./native";
import { keys, type ShipDeps } from "./types";

/** Capped like docs/ARCHITECTURE.md section 2: larger sets would need per device objects. */
export const MAX_OVERRIDES = 500;

export interface PointerDoc extends ChannelPointer {
  headcode: string;
  manifestUrl: string;
  /** Base of the bundle's content-addressed files on the CDN host (`<filesUrl>/<sha256>`). */
  filesUrl: string;
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

/** Every pointer document for an app, computed from the control store. */
async function computePointers(deps: ShipDeps, app: AppDoc): Promise<{ channels: [string, PointerDoc][]; index: PointerIndex }> {
  const channels = await deps.db.listChannels(app.id);
  const overrides = await deps.db.listOverrides(app.id, MAX_OVERRIDES);
  const builds = await deps.db.listNativeBuilds(app.id);
  const limited = await orgLimited(deps.db, app.orgId, deps.now());
  const fresh = (await deps.db.getAppByBundleId(app.bundleId)) ?? app; // defaults may have changed since the caller loaded `app`
  const docs: [string, PointerDoc][] = [];
  for (const ch of channels) {
    if (!ch.currentBundleId) continue;
    const b = await deps.db.getBundle(app.id, ch.currentBundleId);
    if (!b) continue;
    docs.push([keys.ptrChannel(app.bundleId, ch.id), {
      channelId: ch.id,
      bundleVersion: b.version,
      url: deps.store.publicUrl(b.zipKey),
      manifestUrl: deps.store.publicUrl(b.manifestKey),
      filesUrl: deps.store.publicUrl(`blobs/${app.id}`),
      checksum: b.zipSha256,
      rolloutPercent: ch.rolloutPercent,
      paused: ch.paused,
      ...(limited ? { limited: true } : {}),
      ...pointerCompat(b, builds),
      headcode: b.headcode,
      signed: b.signed,
    }]);
  }
  const index: PointerIndex = {
    v: 1,
    bundleId: app.bundleId,
    defaults: fresh.defaultChannelIds,
    channels: Object.fromEntries(channels.map((c) => [c.name, c.id])),
    overrides: Object.fromEntries(overrides.map((o) => [o.deviceId, o.channelId])),
    selfAssign: channels.filter((c) => c.allowSelfAssign).map((c) => c.id),
  };
  return { channels: docs, index };
}

const MAX_PUBLISH_PASSES = 5;

/**
 * Rewrites every pointer for an app from the control store. This is the only writer; the hot path only reads.
 * Called after release, rollback, pause, resume, auto-pause and override changes. The index goes last so a reader
 * never sees an index that references a channel pointer that does not exist yet.
 *
 * Publishes can run concurrently (a release, an auto-pause from a beacon, the limits sweep). A publisher that read the
 * control store before another change but writes after it would put stale state back (for example un-pausing a channel
 * that was just auto-paused). So after writing, the state is read again; if it changed, this publisher writes again.
 * The last writer therefore always holds state read after the last change.
 */
export async function publishPointers(deps: ShipDeps, app: AppDoc): Promise<void> {
  let next = await computePointers(deps, app);
  for (let pass = 0; pass < MAX_PUBLISH_PASSES; pass++) {
    for (const [key, doc] of next.channels) await putJson(deps.store, key, doc, { cacheControl: POINTER_CACHE });
    await putJson(deps.store, keys.ptrIndex(app.bundleId), next.index, { cacheControl: POINTER_CACHE });
    const after = await computePointers(deps, app);
    if (JSON.stringify(after) === JSON.stringify(next)) return;
    next = after;
  }
  throw new Error("pointer_publish_unstable");
}

/**
 * The app's org is gone: devices get no update any more, and the pointer namespace stays reserved (a tombstone index),
 * so nobody can register the same Capacitor app id later and push code to devices that still have the old app installed.
 */
export async function retireAppPointers(deps: ShipDeps, app: AppDoc): Promise<void> {
  const index: PointerIndex & { retired: true } = { v: 1, bundleId: app.bundleId, defaults: {}, channels: {}, overrides: {}, selfAssign: [], retired: true };
  await putJson(deps.store, keys.ptrIndex(app.bundleId), index, { cacheControl: POINTER_CACHE });
  for (const ch of await deps.db.listChannels(app.id)) await deps.store.delete(keys.ptrChannel(app.bundleId, ch.id));
}

/** True when pointers were ever published for this Capacitor app id (live or retired). */
export async function pointerNamespaceUsed(deps: ShipDeps, bundleId: string): Promise<boolean> {
  return deps.store.has(keys.ptrIndex(bundleId));
}
