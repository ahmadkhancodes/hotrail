import { HttpError } from "@/lib/http";
import { recordAudit, requireApp, requireScope } from "./guard";
import type { Principal, ShipDeps } from "./types";

/**
 * Deletes (soft) a bundle. Refused while any channel serves it, and while it is the rollback target of a channel
 * (deleting it would make one click rollback impossible). Stored files stay until a later cleanup.
 */
export async function deleteBundle(deps: ShipDeps, p: Principal, input: { appId: string; bundle: string }): Promise<{ deleted: string }> {
  requireScope(p, "write");
  const app = await requireApp(deps, p, input.appId);
  if (!input.bundle) throw new HttpError(400, "bundle_required");
  const bundle = await deps.db.getBundleByHeadcode(app.id, input.bundle.toUpperCase());
  if (!bundle) throw new HttpError(404, "bundle_not_found");
  const channels = await deps.db.listChannels(app.id);
  const live = channels.filter((c) => c.currentBundleId === bundle.id).map((c) => c.name);
  if (live.length > 0) {
    throw new HttpError(409, "bundle_live", { channels: live, hint: `${bundle.headcode} is live on ${live.join(", ")}. Release another bundle there first.` });
  }
  const target = channels.filter((c) => c.previousBundleId === bundle.id).map((c) => c.name);
  if (target.length > 0) {
    throw new HttpError(409, "bundle_rollback_target", { channels: target, hint: `${bundle.headcode} is the reverse target of ${target.join(", ")}. Release another bundle there first.` });
  }
  if (!(await deps.db.softDeleteBundle(app.id, bundle.id))) throw new HttpError(404, "bundle_not_found");
  await recordAudit(deps, p, "bundle.deleted", `${app.bundleId}@${bundle.version}`, { headcode: bundle.headcode });
  return { deleted: bundle.headcode };
}
