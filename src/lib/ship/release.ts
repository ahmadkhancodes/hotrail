import type { AppDoc, BundleDoc, ChannelDoc, ReleaseAction } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { recordAudit, requireApp, requireScope } from "./guard";
import { incompatibleFor, type Incompatible } from "./native";
import { publishPointers } from "./pointers";
import type { Principal, ShipDeps } from "./types";

export interface ReleaseInput {
  appId: string;
  channel: string;
  bundle?: string; // headcode
  version?: string;
  percent?: number;
  autopauseThreshold?: number;
}

export interface ReleaseResult { headcode: string; version: string; percent: number; channel: string; action: ReleaseAction; /** Recorded store builds that will not get this bundle, with the reason. */ incompatible: Incompatible[] }

async function getChannelOrCreate(deps: ShipDeps, p: Principal, app: AppDoc, name: string, create: boolean): Promise<ChannelDoc> {
  const existing = await deps.db.getChannelByName(app.id, name);
  if (existing) return existing;
  if (!create) throw new HttpError(404, "channel_not_found", { channel: name });
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) throw new HttpError(400, "invalid_channel", { hint: "Use lowercase letters, digits, - or _ (max 32)." });
  try {
    const ch = await deps.db.createChannel({
      id: uuidv7(), orgId: p.orgId, appId: app.id, name, platform: "all", currentBundleId: null, previousBundleId: null,
      rolloutPercent: 100, autopauseThreshold: app.autopauseThreshold, minSample: app.minSample, paused: false, pausedReason: null, protected: false, allowSelfAssign: false,
    });
    await recordAudit(deps, p, "channel.created", `${app.bundleId}:${name}`, { channelId: ch.id });
    return ch;
  } catch (e) {
    if ((e as Error).message === "duplicate_channel") return (await deps.db.getChannelByName(app.id, name))!;
    throw e;
  }
}

async function bundleById(deps: ShipDeps, app: AppDoc, id: string | null): Promise<BundleDoc | null> {
  return id ? deps.db.getBundle(app.id, id) : null;
}

async function recordRelease(deps: ShipDeps, p: Principal | null, app: AppDoc, ch: ChannelDoc, r: { action: ReleaseAction; bundleId: string | null; fromBundleId: string | null; percent: number; cause?: string | null }) {
  await deps.db.appendRelease({
    id: uuidv7(), orgId: app.orgId, appId: app.id, channelId: ch.id, channelName: ch.name, action: r.action,
    bundleId: r.bundleId, fromBundleId: r.fromBundleId, percent: r.percent, actor: p?.actor ?? "system", cause: r.cause ?? null, at: deps.now(),
  });
}

/** Point a channel at a bundle at a rollout percent. Re-releasing the live bundle at a new percent only moves the signal. */
export async function releaseBundle(deps: ShipDeps, p: Principal, input: ReleaseInput): Promise<ReleaseResult> {
  requireScope(p, "write");
  const app = await requireApp(deps, p, input.appId);
  const percent = input.percent ?? 100;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new HttpError(400, "invalid_percent");
  if (input.autopauseThreshold !== undefined && !(input.autopauseThreshold >= 0 && input.autopauseThreshold <= 1)) throw new HttpError(400, "invalid_threshold");
  if (!input.bundle && !input.version) throw new HttpError(400, "bundle_required");
  const bundle = input.bundle ? await deps.db.getBundleByHeadcode(app.id, input.bundle.toUpperCase()) : await deps.db.getBundleByVersion(app.id, input.version!);
  if (!bundle) throw new HttpError(404, "bundle_not_found");
  const ch = await getChannelOrCreate(deps, p, app, input.channel, true);

  const same = ch.currentBundleId === bundle.id;
  const updated = await deps.db.updateChannel(app.id, ch.id, {
    currentBundleId: bundle.id,
    previousBundleId: same ? ch.previousBundleId : ch.currentBundleId,
    rolloutPercent: percent,
    paused: false,
    pausedReason: null,
    ...(input.autopauseThreshold !== undefined ? { autopauseThreshold: input.autopauseThreshold } : {}),
  }, ch.rev);
  if (!updated) throw new HttpError(409, "channel_busy", { hint: "Another release changed this channel at the same time. Retry." });

  const action: ReleaseAction = same ? "percent" : "release";
  await recordRelease(deps, p, app, ch, { action, bundleId: bundle.id, fromBundleId: ch.currentBundleId, percent });
  await recordAudit(deps, p, `channel.${action === "percent" ? "percent_changed" : "released"}`, `${app.bundleId}:${ch.name}`, { headcode: bundle.headcode, version: bundle.version, percent, from: ch.rolloutPercent });
  await publishPointers(deps, app);
  await deps.emit(p.orgId, "release.created", { app: app.bundleId, channel: ch.name, headcode: bundle.headcode, version: bundle.version, percent, action }).catch(() => undefined);
  return { headcode: bundle.headcode, version: bundle.version, percent, channel: ch.name, action, incompatible: await incompatibleFor(deps, app, bundle) };
}

/** One click rollback: the previous bundle goes live at 100% and the channel is un-paused. */
export async function rollbackChannel(deps: ShipDeps, p: Principal, input: { appId: string; channel: string }): Promise<ReleaseResult> {
  requireScope(p, "write");
  const app = await requireApp(deps, p, input.appId);
  const ch = await getChannelOrCreate(deps, p, app, input.channel, false);
  const prev = await bundleById(deps, app, ch.previousBundleId);
  if (!prev) throw new HttpError(409, "no_previous_bundle", { hint: "This channel has no earlier bundle to reverse to." });
  const updated = await deps.db.updateChannel(app.id, ch.id, {
    currentBundleId: prev.id, previousBundleId: null, rolloutPercent: 100, paused: false, pausedReason: null,
  }, ch.rev);
  if (!updated) throw new HttpError(409, "channel_busy", { hint: "Another release changed this channel at the same time. Retry." });
  await recordRelease(deps, p, app, ch, { action: "rollback", bundleId: prev.id, fromBundleId: ch.currentBundleId, percent: 100 });
  const from = await bundleById(deps, app, ch.currentBundleId);
  await recordAudit(deps, p, "channel.rolled_back", `${app.bundleId}:${ch.name}`, { to: prev.headcode, from: from?.headcode ?? null });
  await publishPointers(deps, app);
  await deps.emit(p.orgId, "release.rolled_back", { app: app.bundleId, channel: ch.name, headcode: prev.headcode, version: prev.version, from: from?.headcode ?? null }).catch(() => undefined);
  return { headcode: prev.headcode, version: prev.version, percent: 100, channel: ch.name, action: "rollback", incompatible: await incompatibleFor(deps, app, prev) };
}

export async function setChannelPaused(deps: ShipDeps, p: Principal, input: { appId: string; channel: string; paused: boolean }): Promise<{ channel: string; paused: boolean }> {
  requireScope(p, "write");
  const app = await requireApp(deps, p, input.appId);
  const ch = await getChannelOrCreate(deps, p, app, input.channel, false);
  if (ch.paused === input.paused) return { channel: ch.name, paused: ch.paused };
  const updated = await deps.db.updateChannel(app.id, ch.id, { paused: input.paused, pausedReason: input.paused ? "manual" : null }, ch.rev);
  if (!updated) throw new HttpError(409, "channel_busy");
  await recordRelease(deps, p, app, ch, { action: input.paused ? "pause" : "resume", bundleId: ch.currentBundleId, fromBundleId: ch.currentBundleId, percent: ch.rolloutPercent, cause: input.paused ? "manual" : null });
  await recordAudit(deps, p, input.paused ? "channel.paused" : "channel.resumed", `${app.bundleId}:${ch.name}`);
  await publishPointers(deps, app);
  if (input.paused) await deps.emit(p.orgId, "channel.paused", { app: app.bundleId, channel: ch.name, cause: "manual" }).catch(() => undefined);
  return { channel: ch.name, paused: input.paused };
}

export const AUTOPAUSE_WINDOW_MS = 10 * 60_000; // two five minute buckets

/**
 * Pauses a channel when failures / (applied + failed) for its live bundle over the last two buckets passes the
 * threshold and there are at least `minSample` outcomes. Idempotent: an already paused channel is left alone.
 * Called after every failure beacon; the M3 cron sweep calls it for all live channels.
 */
export async function evaluateAutopause(deps: ShipDeps, app: AppDoc, channelId: string): Promise<{ paused: boolean; rate: number; sample: number }> {
  const ch = await deps.db.getChannel(app.id, channelId);
  if (!ch || ch.paused || !ch.currentBundleId) return { paused: false, rate: 0, sample: 0 };
  const bundle = await deps.db.getBundle(app.id, ch.currentBundleId);
  if (!bundle) return { paused: false, rate: 0, sample: 0 };
  const events = await deps.db.listEvents(app.id, { since: new Date(deps.now().getTime() - AUTOPAUSE_WINDOW_MS), channelId: ch.id, bundleVersion: bundle.version, limit: 5000 });
  let failed = 0;
  let ok = 0;
  for (const e of events) {
    if (e.action === "failed" || e.action === "rolledBack") failed++;
    else if (e.action === "applied") ok++;
  }
  const sample = failed + ok;
  const rate = sample === 0 ? 0 : failed / sample;
  if (sample < ch.minSample || rate <= ch.autopauseThreshold) return { paused: false, rate, sample };
  const cause = `autopause: ${(rate * 100).toFixed(1)}% failures over ${sample} outcomes (limit ${(ch.autopauseThreshold * 100).toFixed(1)}%)`;
  const updated = await deps.db.updateChannel(app.id, ch.id, { paused: true, pausedReason: cause }, ch.rev);
  if (!updated) return { paused: false, rate, sample }; // someone else changed it; the next beacon re-evaluates
  await recordRelease(deps, null, app, ch, { action: "autopause", bundleId: bundle.id, fromBundleId: bundle.id, percent: ch.rolloutPercent, cause });
  await deps.db.appendAudit({ orgId: app.orgId, actorId: null, action: "channel.autopaused", target: `${app.bundleId}:${ch.name}`, meta: { headcode: bundle.headcode, rate: Number(rate.toFixed(4)), sample }, at: deps.now() });
  await publishPointers(deps, app);
  await deps.emit(app.orgId, "channel.paused", { app: app.bundleId, channel: ch.name, headcode: bundle.headcode, cause, rate, sample }).catch(() => undefined);
  return { paused: true, rate, sample };
}
