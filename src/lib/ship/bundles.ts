import type { BundleDoc } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { getJson } from "@/lib/storage/types";
import { recordAudit, requireApp, requireScope } from "./guard";
import { keys, type Principal, type ShipDeps } from "./types";

/**
 * Deletes (soft) a bundle. Refused while any channel serves it, and while it is the rollback target of a channel
 * (deleting it would make one click rollback impossible). Stored files stay until a later cleanup.
 */
export async function deleteBundle(deps: ShipDeps, p: Principal, input: { appId: string; bundle: string }): Promise<{ deleted: string; filesDeleted: number }> {
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
  const filesDeleted = await deleteStoredFiles(deps, app.id, bundle).catch(() => -1);
  await recordAudit(deps, p, "bundle.deleted", `${app.bundleId}@${bundle.version}`, { headcode: bundle.headcode, filesDeleted });
  return { deleted: bundle.headcode, filesDeleted };
}

/**
 * Removes the zip, the manifest and every content-addressed blob that no other remaining bundle of the app still lists
 * (blobs are shared between versions by hash). Returns how many objects were deleted, or throws if the manifest is unreadable.
 */
export async function deleteStoredFiles(deps: ShipDeps, appDocId: string, bundle: BundleDoc): Promise<number> {
  const manifestOf = async (b: BundleDoc) => getJson<{ manifest: { files: { sha256: string }[] } }>(deps.store, b.manifestKey);
  const mine = await manifestOf(bundle);
  const still = new Set<string>();
  for (const other of await deps.db.listBundles(appDocId, 5000)) {
    if (other.id === bundle.id) continue;
    const m = await manifestOf(other);
    for (const f of m?.manifest.files ?? []) still.add(f.sha256);
  }
  let n = 0;
  for (const sha of new Set((mine?.manifest.files ?? []).map((f) => f.sha256))) {
    if (still.has(sha)) continue;
    await deps.store.delete(keys.blob(appDocId, sha));
    n++;
  }
  await deps.store.delete(bundle.zipKey);
  await deps.store.delete(bundle.manifestKey);
  return n + 2;
}
