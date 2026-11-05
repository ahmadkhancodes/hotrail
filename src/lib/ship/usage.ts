import { BUCKET_MS, bucketStart } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { requireApp, requireScope } from "./guard";
import type { Principal, ShipDeps } from "./types";

export interface UsagePoint { t: string; download: number; applied: number; failed: number; rolledBack: number }
export interface UsageSeries {
  from: string;
  to: string;
  bucketMinutes: 5;
  /** All outcomes per five minutes. */
  points: UsagePoint[];
  /** Applied per bucket by bundle version, aligned with `points`; `cumulative` is the running total (the adoption curve). */
  versions: { version: string; headcode: string | null; applied: number[]; cumulative: number[] }[];
  totals: { download: number; applied: number; failed: number; rolledBack: number };
}

export const MAX_USAGE_HOURS = 72;

export async function usageSeries(deps: ShipDeps, p: Principal, input: { appId: string; hours: number }): Promise<UsageSeries> {
  requireScope(p, "read");
  const app = await requireApp(deps, p, input.appId);
  const hours = Number.isFinite(input.hours) ? Math.min(MAX_USAGE_HOURS, Math.max(1, Math.floor(input.hours))) : 24;
  if (!Number.isFinite(hours)) throw new HttpError(400, "invalid_hours");
  const end = bucketStart(deps.now()).getTime() + BUCKET_MS;
  const start = end - hours * 3_600_000;
  const [rows, bundles] = await Promise.all([deps.db.listBuckets(app.id, { since: new Date(start), until: new Date(end) }), deps.db.listBundles(app.id, 200)]);
  const n = (end - start) / BUCKET_MS;
  const points: UsagePoint[] = Array.from({ length: n }, (_, i) => ({ t: new Date(start + i * BUCKET_MS).toISOString(), download: 0, applied: 0, failed: 0, rolledBack: 0 }));
  const perVersion = new Map<string, number[]>();
  const totals = { download: 0, applied: 0, failed: 0, rolledBack: 0 };
  for (const r of rows) {
    const i = Math.floor((r.bucket.getTime() - start) / BUCKET_MS);
    const pt = points[i];
    if (!pt) continue;
    for (const k of ["download", "applied", "failed", "rolledBack"] as const) { pt[k] += r.counts[k]; totals[k] += r.counts[k]; }
    if (r.counts.applied > 0) {
      const v = r.bundleVersion ?? "builtin";
      const arr = perVersion.get(v) ?? new Array<number>(n).fill(0);
      arr[i]! += r.counts.applied;
      perVersion.set(v, arr);
    }
  }
  const versions = [...perVersion.entries()].map(([version, applied]) => {
    let run = 0;
    return { version, headcode: bundles.find((b) => b.version === version)?.headcode ?? null, applied, cumulative: applied.map((x) => (run += x)) };
  }).sort((a, b) => b.cumulative[n - 1]! - a.cumulative[n - 1]!);
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), bucketMinutes: 5, points, versions, totals };
}
