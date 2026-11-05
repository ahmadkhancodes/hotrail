import { HttpError } from "@/lib/http";
import type { AppDoc } from "@/lib/db/types";
import type { ShipDeps, Principal } from "./types";

export type Need = "upload" | "read" | "write";

/** upload keys can only upload; read keys can only read; all keys (and members who can write) do everything. */
export function requireScope(p: Principal, need: Need): void {
  if (p.scope === "all") return;
  if (p.scope === "upload" && need === "upload") return;
  if (p.scope === "read" && need === "read") return;
  throw new HttpError(403, "insufficient_scope", { need, have: p.scope });
}

/** Tenant check: another org's app looks like it does not exist. */
export async function requireApp(deps: ShipDeps, p: Principal, bundleId: string): Promise<AppDoc> {
  const app = await deps.db.getAppByBundleId(bundleId);
  if (!app || app.orgId !== p.orgId) throw new HttpError(404, "app_not_found");
  return app;
}

export async function recordAudit(deps: ShipDeps, p: Principal, action: string, target: string, meta: Record<string, string | number | boolean | null> = {}) {
  await deps.db.appendAudit({ orgId: p.orgId, actorId: p.actor, action, target, meta, ip: p.ip ?? null, at: deps.now() });
}

export type KeyScope = "upload" | "read" | "all";

/** Scope lives in the key's metadata (`{scope}`), default `all`. Unknown values fall back to the least privilege `read`. */
export function scopeFromMetadata(meta: unknown): KeyScope {
  let m = meta;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
  const s = (m as { scope?: unknown } | null)?.scope;
  if (s === undefined || s === null) return "all";
  return s === "upload" || s === "read" || s === "all" ? s : "read";
}

