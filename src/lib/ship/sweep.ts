import { evaluateAutopause } from "./release";
import type { ShipDeps } from "./types";

export interface SweepResult { checked: number; paused: { app: string; channel: string; rate: number; sample: number }[]; errors: number }

/**
 * The per minute auto-pause sweep (Cloudflare Worker cron -> /api/cron/autopause-sweep). Beacons already evaluate one
 * channel after each failure; the sweep catches channels whose failures stopped arriving (devices that crashed offline,
 * or a lost beacon) and any channel whose window crossed the threshold between beacons. Idempotent: paused channels
 * are skipped and evaluateAutopause re-checks with a compare-and-set.
 */
export async function autopauseSweep(deps: ShipDeps, opts: { limit?: number } = {}): Promise<SweepResult> {
  const channels = await deps.db.listLiveChannels(opts.limit ?? 2000);
  const result: SweepResult = { checked: 0, paused: [], errors: 0 };
  const apps = new Map<string, Awaited<ReturnType<ShipDeps["db"]["getAppById"]>>>();
  for (const ch of channels) {
    try {
      if (!apps.has(ch.appId)) apps.set(ch.appId, await deps.db.getAppById(ch.appId));
      const app = apps.get(ch.appId);
      if (!app) continue;
      result.checked++;
      const r = await evaluateAutopause(deps, app, ch.id);
      if (r.paused) result.paused.push({ app: app.bundleId, channel: ch.name, rate: r.rate, sample: r.sample });
    } catch {
      result.errors++; // one bad channel never blocks the rest
    }
  }
  return result;
}
