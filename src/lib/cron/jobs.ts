import { shipDeps } from "@/lib/ship/context";
import { limitsSweep } from "@/lib/ship/metering";
import { autopauseSweep } from "@/lib/ship/sweep";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "autopause-sweep": async () => autopauseSweep(await shipDeps()),
  "limits-sweep": async () => limitsSweep(await shipDeps()),
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
