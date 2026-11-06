/**
 * Cloudflare Worker cron: calls /api/cron/<job> every minute (Vercel Hobby allows 1 cron/day, which stays as a backstop).
 * Jobs: `autopause-sweep` (pauses channels whose failure rate crossed the threshold) and `webhook-retries`.
 * Deploy: cd infra/cron-worker && npx wrangler secret put CRON_SECRET && npx wrangler deploy
 */
export interface Env { APP_URL: string; CRON_SECRET: string; JOBS?: string }

export const DEFAULT_JOBS = "autopause-sweep,limits-sweep,webhook-retries";

export const jobsOf = (env: Pick<Env, "JOBS">): string[] => (env.JOBS ?? DEFAULT_JOBS).split(",").map((s) => s.trim()).filter(Boolean);

/** One call per job, all in parallel; a failing job is logged and never blocks the others. Resolves with the status per job. */
export async function runJobs(env: Env, fetchFn: typeof fetch = fetch): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(jobsOf(env).map(async (job) => {
    try {
      const r = await fetchFn(`${env.APP_URL}/api/cron/${job}`, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
      out[job] = r.status;
      if (!r.ok) console.error(`cron ${job} -> ${r.status}`);
    } catch (e) {
      out[job] = 0;
      console.error(`cron ${job} failed: ${(e as Error).message}`);
    }
  }));
  return out;
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(runJobs(env));
  },
};
