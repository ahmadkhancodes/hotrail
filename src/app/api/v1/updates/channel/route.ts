import { clientIp, HttpError, json } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/ratelimit";
import { clearDeviceChannel, getDeviceChannel, selfAssignChannel, type DeviceChannelRequest } from "@/lib/ship/device";
import { shipDeps } from "@/lib/ship/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function body(req: Request): Promise<DeviceChannelRequest> {
  try { return (await req.json()) as DeviceChannelRequest; } catch { return {}; }
}

function fail(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: (e.details as { message?: string } | undefined)?.message ?? e.code }, e.status);
  return json({ error: "server_error" }, 500);
}

/** `channelUrl`: GET what channel am I on, POST pick one (when the channel allows it), DELETE go back to the default. */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = { app_id: u.searchParams.get("app_id") ?? undefined, device_id: u.searchParams.get("device_id") ?? undefined, platform: u.searchParams.get("platform") ?? undefined };
    return json(await getDeviceChannel(await shipDeps(), q));
  } catch (e) { return fail(e); }
}
/** Writes republish pointers, so they are limited per client IP (devices change channel rarely). */
const WRITE_LIMIT = { limit: 30, windowMs: 60_000 };
export async function POST(req: Request) {
  try {
    const deps = await shipDeps();
    await enforceRateLimit(`devchan:${clientIp(req)}`, WRITE_LIMIT, deps.db);
    return json(await selfAssignChannel(deps, await body(req)));
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  try {
    const deps = await shipDeps();
    await enforceRateLimit(`devchan:${clientIp(req)}`, WRITE_LIMIT, deps.db);
    return json(await clearDeviceChannel(deps, await body(req)));
  } catch (e) { return fail(e); }
}
