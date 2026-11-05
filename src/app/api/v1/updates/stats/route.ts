import { ingestStats, type StatsBeacon } from "@/lib/ship/device";
import { shipDeps } from "@/lib/ship/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "content-type": "application/json", "cache-control": "no-store" };

/** @capgo/capacitor-updater `statsUrl`: fire and forget beacons. Always 200. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StatsBeacon;
    const deps = await shipDeps();
    // Cheap flood guard per device; beyond the cap beacons are dropped silently.
    if (body.device_id && (await deps.db.hitRateLimit(`stats:${body.app_id}:${body.device_id}`, 60_000)) > 120) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers });
    }
    await ingestStats(deps, body);
  } catch {
    // swallow: a beacon must never surface an error to the device
  }
  return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers });
}
