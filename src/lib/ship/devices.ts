import type { EventDoc } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { requireApp, requireScope } from "./guard";
import type { Principal, ShipDeps } from "./types";

export interface DeviceLookup {
  found: boolean;
  device?: {
    deviceId: string;
    customId: string | null;
    platform: string;
    bundleVersion: string | null;
    headcode: string | null;
    versionBuild: string | null;
    channel: string | null;
    override: string | null;
    lastSeenAt: string;
  };
  events: { ts: string; action: EventDoc["action"]; cause: string; bundleVersion: string | null; channel: string | null }[];
}

/** Find a device by its id or by the app's own custom id, with its latest events (newest first). */
export async function findDevice(deps: ShipDeps, p: Principal, input: { appId: string; q: string }): Promise<DeviceLookup> {
  requireScope(p, "read");
  const app = await requireApp(deps, p, input.appId);
  const q = input.q.trim();
  if (!q || q.length > 128) throw new HttpError(400, "invalid_query");
  const device = (await deps.db.getDevice(app.id, q)) ?? (await deps.db.getDeviceByCustomId(app.id, q));
  if (!device) return { found: false, events: [] };
  const [channels, bundles, override, events] = await Promise.all([
    deps.db.listChannels(app.id), deps.db.listBundles(app.id, 200), deps.db.getOverride(app.id, device.deviceId),
    deps.db.listEvents(app.id, { deviceId: device.deviceId, limit: 50 }),
  ]);
  const chName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? null;
  return {
    found: true,
    device: {
      deviceId: device.deviceId, customId: device.customId ?? null, platform: device.platform, bundleVersion: device.bundleVersion,
      headcode: bundles.find((b) => b.version === device.bundleVersion)?.headcode ?? null, versionBuild: device.versionBuild,
      channel: chName(device.channelId), override: override ? chName(override.channelId) : null, lastSeenAt: device.lastSeenAt.toISOString(),
    },
    events: events.map((e) => ({ ts: e.ts.toISOString(), action: e.action, cause: e.cause, bundleVersion: e.bundleVersion, channel: chName(e.channelId) })),
  };
}
