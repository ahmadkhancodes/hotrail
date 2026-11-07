import { getDb } from "@/lib/db";
import { dbDriver } from "@/lib/env";
import { probeDb } from "@/lib/health";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus a database check. 503 when the database is down (the update check route keeps answering from pointers). */
export async function GET() {
  const db = await probeDb(async () => (await getDb()).hasStripeEvent("__health_probe__"));
  return json(
    { ok: db.ok, db: { driver: dbDriver(), ok: db.ok, ms: db.ms, ...(db.error ? { error: db.error } : {}) }, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() },
    db.ok ? 200 : 503,
  );
}
