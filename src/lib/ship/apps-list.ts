import type { Principal, ShipDeps } from "./types";

export async function listAppsFor(deps: ShipDeps, p: Principal) {
  return (await deps.db.listApps(p.orgId)).map((a) => ({ bundleId: a.bundleId, name: a.name, signingMode: a.signingMode, createdAt: a.createdAt.toISOString() }));
}
