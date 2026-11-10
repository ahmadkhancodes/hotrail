import { shipDeps } from "@/lib/ship/context";
import { limitsSweep } from "@/lib/ship/metering";
import { autopauseSweep } from "@/lib/ship/sweep";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry due webhook deliveries in passes until nothing is due or the time budget is spent (daily scheduler, 60 s function limit). */
export async function retryLoop(budgetMs = 45_000, pauseMs = 5_000) {
  const end = Date.now() + budgetMs;
  let processed = 0, succeeded = 0, passes = 0;
  while (Date.now() < end) {
    const r = await retryDueDeliveries({ limit: 100 });
    passes++;
    processed += r.processed;
    succeeded += r.succeeded;
    if (r.processed === 0 || Date.now() + pauseMs >= end) break;
    await sleep(pauseMs);
  }
  return { passes, processed, succeeded };
}

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "autopause-sweep": async () => autopauseSweep(await shipDeps()),
  "limits-sweep": async () => limitsSweep(await shipDeps()),
  "webhook-retries": () => retryLoop(),
  /** One daily entry for Vercel Hobby (two cron slots): both sweeps in one request. */
  maintenance: async () => {
    const deps = await shipDeps();
    return { autopause: await autopauseSweep(deps), limits: await limitsSweep(deps) };
  },
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
