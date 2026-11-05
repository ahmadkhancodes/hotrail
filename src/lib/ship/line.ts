import type { BundleDoc, ChannelDoc, ReleaseDoc } from "@/lib/db/types";
import { requireApp, requireScope } from "./guard";
import { compatibilityOf, type Incompatible } from "./native";
import type { Principal, ShipDeps } from "./types";

export type Lamp = "green" | "amber" | "red" | "idle";

export interface LineChannel {
  id: string;
  name: string;
  platform: ChannelDoc["platform"];
  headcode: string | null;
  version: string | null;
  previousHeadcode: string | null;
  percent: number;
  paused: boolean;
  pausedReason: string | null;
  autopauseThreshold: number;
  lamp: Lamp;
  devices: number;
  failureRate: number;
}

export interface LineBundle {
  id: string;
  headcode: string;
  version: string;
  nativeFingerprint: string;
  signed: boolean;
  sizeBytes: number;
  createdAt: string;
  devices: number;
  adoption: number; // 0..1 of devices seen in the last 30 days
  failureRate: number; // 0..1, last 24 h
  channels: string[]; // channel names where this is the live bundle
  uploadRatio: number;
  /** Recorded store builds that will NOT be offered this bundle, each with the plain reason. */
  incompatible: Incompatible[];
}

export interface LineRelease { id: string; channel: string; action: ReleaseDoc["action"]; headcode: string | null; percent: number; actor: string; cause: string | null; at: string }

export interface LineView {
  app: { bundleId: string; name: string; signingMode: string; autopauseThreshold: number };
  channels: LineChannel[];
  bundles: LineBundle[];
  releases: LineRelease[];
  /** Store builds the server knows (native fingerprints). Empty until `hotrail native register` runs. */
  nativeBuilds: { versionBuild: string; fingerprint: string; devices: number }[];
  totals: { devices: number };
  generatedAt: string;
}

const DAY = 864e5;

export function lampOf(ch: Pick<ChannelDoc, "currentBundleId" | "paused" | "rolloutPercent">): Lamp {
  if (!ch.currentBundleId) return "idle";
  if (ch.paused) return "red";
  return ch.rolloutPercent < 100 ? "amber" : "green";
}

export async function buildLine(deps: ShipDeps, p: Principal, bundleId: string): Promise<LineView> {
  requireScope(p, "read");
  const app = await requireApp(deps, p, bundleId);
  const now = deps.now();
  const [channels, bundles, releases, byVersion, byChannel, events, nativeBuilds, byBuild] = await Promise.all([
    deps.db.listChannels(app.id),
    deps.db.listBundles(app.id, 50),
    deps.db.listReleases(app.id, 12),
    deps.db.deviceCounts(app.id, "bundleVersion", new Date(now.getTime() - 30 * DAY)),
    deps.db.deviceCounts(app.id, "channelId", new Date(now.getTime() - 30 * DAY)),
    deps.db.listEvents(app.id, { since: new Date(now.getTime() - DAY), limit: 5000 }),
    deps.db.listNativeBuilds(app.id),
    deps.db.deviceCounts(app.id, "versionBuild", new Date(now.getTime() - 30 * DAY)),
  ]);
  const byId = new Map<string, BundleDoc>(bundles.map((b) => [b.id, b]));
  const total = Object.values(byVersion).reduce((n, x) => n + x, 0);

  const rate = (pred: (e: (typeof events)[number]) => boolean) => {
    let ok = 0;
    let bad = 0;
    for (const e of events) {
      if (!pred(e)) continue;
      if (e.action === "applied") ok++;
      else if (e.action === "failed" || e.action === "rolledBack") bad++;
    }
    return ok + bad === 0 ? 0 : bad / (ok + bad);
  };

  const lineChannels: LineChannel[] = channels.map((c) => {
    const live = c.currentBundleId ? byId.get(c.currentBundleId) : undefined;
    const prev = c.previousBundleId ? byId.get(c.previousBundleId) : undefined;
    return {
      id: c.id, name: c.name, platform: c.platform, headcode: live?.headcode ?? null, version: live?.version ?? null,
      previousHeadcode: prev?.headcode ?? null, percent: c.rolloutPercent, paused: c.paused, pausedReason: c.pausedReason,
      autopauseThreshold: c.autopauseThreshold, lamp: lampOf(c), devices: byChannel[c.id] ?? 0,
      failureRate: rate((e) => e.channelId === c.id && (!live || e.bundleVersion === live.version)),
    };
  });
  const lineBundles: LineBundle[] = bundles.map((b) => ({
    id: b.id, headcode: b.headcode, version: b.version, nativeFingerprint: b.nativeFingerprint, signed: b.signed, sizeBytes: b.sizeBytes,
    createdAt: b.createdAt.toISOString(), devices: byVersion[b.version] ?? 0, adoption: total === 0 ? 0 : (byVersion[b.version] ?? 0) / total,
    failureRate: rate((e) => e.bundleVersion === b.version), channels: channels.filter((c) => c.currentBundleId === b.id).map((c) => c.name),
    uploadRatio: b.delta.uploadRatio, incompatible: compatibilityOf(b, nativeBuilds).incompatible,
  }));
  const lineReleases: LineRelease[] = releases.map((r) => ({
    id: r.id, channel: r.channelName, action: r.action, headcode: r.bundleId ? byId.get(r.bundleId)?.headcode ?? null : null,
    percent: r.percent, actor: r.actor, cause: r.cause, at: r.at.toISOString(),
  }));
  return {
    app: { bundleId: app.bundleId, name: app.name, signingMode: app.signingMode, autopauseThreshold: app.autopauseThreshold },
    channels: lineChannels, bundles: lineBundles, releases: lineReleases,
    nativeBuilds: nativeBuilds.map((b) => ({ versionBuild: b.versionBuild, fingerprint: b.fingerprint, devices: byBuild[b.versionBuild] ?? 0 })), totals: { devices: total }, generatedAt: now.toISOString(),
  };
}
