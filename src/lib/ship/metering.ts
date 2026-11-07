import { crossedThresholds, mauReport, storageState } from "@/lib/billing/limits";
import { periodOf } from "@/lib/billing/usage";
import { HttpError } from "@/lib/http";
import { publishPointers } from "./pointers";
import type { ShipDeps } from "./types";

const ACTIVE_ROW_TTL_DAYS = 70;

/**
 * Counts one device as a monthly active user the first time it checks for an update in a calendar month (UTC).
 * Runs after the response has been sent, never on the hot path's critical path. Then, if the total crossed 50, 70,
 * 90 or 100% of the plan's MAU for the first time this period, emails the org owners once, and at the limit
 * republishes pointers so new downloads pause.
 */
export async function recordActiveDevice(deps: ShipDeps, bundleId: string, deviceId: string): Promise<{ counted: boolean }> {
  if (!bundleId || !deviceId || deviceId.length > 128) return { counted: false };
  const app = await deps.db.getAppByBundleId(bundleId);
  if (!app) return { counted: false };
  const now = deps.now();
  const period = periodOf(now);
  const first = await deps.db.markActiveDevice({ appId: app.id, orgId: app.orgId, period, deviceId, expiresAt: new Date(now.getTime() + ACTIVE_ROW_TTL_DAYS * 864e5) });
  if (!first) return { counted: false };
  await deps.db.incUsage(app.orgId, "mau", period, 1);
  await evaluateMauNotices(deps, app.orgId);
  return { counted: true };
}

/** Idempotent: safe to call from the cron sweep, the webhook and the counter. */
export async function evaluateMauNotices(deps: ShipDeps, orgId: string): Promise<{ sent: number[]; limited: boolean }> {
  const now = deps.now();
  const r = await mauReport(deps.db, orgId, now);
  const crossed = crossedThresholds(r.used, r.included);
  const fresh: number[] = [];
  for (const t of crossed) if (await deps.db.setOrgFlag(orgId, `usage-notice:${r.period}:mau:${t}`, now.toISOString(), { ifAbsent: true })) fresh.push(t);
  // One email for the highest threshold crossed, even if several were crossed at once.
  const top = Math.max(0, ...fresh);
  if (top > 0) await deps.notify?.usage(orgId, { percent: top, used: r.used, limit: r.included, plan: r.plan, period: r.period, limited: r.limited });
  // Pointers carry `limited`; republish only when the state changed.
  const was = (await deps.db.getOrgFlag(orgId, "limited")) === "1";
  if (was !== r.limited) {
    await deps.db.setOrgFlag(orgId, "limited", r.limited ? "1" : "0");
    await syncOrgLimits(deps, orgId);
  }
  return { sent: fresh, limited: r.limited };
}

/** Republish every pointer of the org so a plan or limit change reaches devices (called by the Stripe webhook and the cron job). */
export async function syncOrgLimits(deps: ShipDeps, orgId: string): Promise<{ apps: number }> {
  const apps = await deps.db.listApps(orgId);
  for (const a of apps) await publishPointers(deps, a);
  const r = await mauReport(deps.db, orgId, deps.now());
  await deps.db.setOrgFlag(orgId, "limited", r.limited ? "1" : "0");
  return { apps: apps.length };
}

/** Cron: month rollovers and plan expiry change `limited` without any device or webhook event. */
export async function limitsSweep(deps: ShipDeps): Promise<{ orgs: number; changed: number }> {
  const orgs = [...new Set((await deps.db.listAllApps()).map((a) => a.orgId))];
  let changed = 0;
  for (const orgId of orgs) {
    try {
      const was = (await deps.db.getOrgFlag(orgId, "limited")) === "1";
      const r = await evaluateMauNotices(deps, orgId);
      if (was !== r.limited) changed++;
    } catch { /* one org never stops the sweep */ }
  }
  return { orgs: orgs.length, changed };
}

/** Storage is fair use: refuse new bundles once the plan's storage is full. Existing bundles keep serving. */
export async function assertStorageWithin(deps: ShipDeps, orgId: string, incomingBytes = 0): Promise<void> {
  const s = await storageState(deps.db, orgId, deps.now());
  if (s.limit > 0 && s.bytes + incomingBytes > s.limit * 1024 ** 3) {
    throw new HttpError(402, "storage_limit", { limitGiB: s.limit, usedGiB: s.used, hint: "Delete old bundles or upgrade. Installed apps keep working." });
  }
}
