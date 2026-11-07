import { type PlanId } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { effectivePlan } from "./entitlement";
import { periodOf, usageState, type UsageState } from "./usage";

// Plan limits from product.ts, applied to what the update path actually measures.
// MAU: distinct devices that checked for an update this calendar month (UTC). Storage: bytes of stored bundles.
// Event retention: plan.limits.event_days, applied when an event is stored. Build minutes: v1 (no build farm yet).

/** Extra MAU price on paid plans (docs/brief.md, Pricing). Reported, not auto-billed. */
export const OVERAGE_USD_PER_MAU = 0.0015;
/** Emails go out the first time usage crosses each of these shares of the plan's MAU, once per period. */
export const NOTICE_THRESHOLDS = [50, 70, 90, 100] as const;
export type NoticeThreshold = (typeof NOTICE_THRESHOLDS)[number];

export const GIB = 1024 ** 3;
const OVERAGE_FLAG = "overage_cap_usd";

/** Customer set monthly cap for extra MAU, in whole USD. 0 = overage off (hit the limit and downloads pause). Free has no overage. */
export async function overageCapUsd(db: Db, orgId: string, now = new Date()): Promise<number> {
  const ent = await db.getEntitlement(orgId);
  if (effectivePlan(ent, now.getTime()).id === "free") return 0;
  const n = Number(await db.getOrgFlag(orgId, OVERAGE_FLAG));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function setOverageCapUsd(db: Db, orgId: string, usd: number): Promise<void> {
  await db.setOrgFlag(orgId, OVERAGE_FLAG, String(Math.max(0, Math.min(100_000, Math.floor(usd)))));
}

export interface MauReport {
  period: string;
  plan: PlanId;
  used: number;
  /** MAU included in the plan. */
  included: number;
  /** Included plus what the overage cap pays for; downloads pause once used reaches this. */
  allowed: number;
  overCap: number;
  overageUsd: number;
  /** Overage is only ever reported: nothing is charged until a Stripe metered price is switched on. */
  billed: false;
  limited: boolean;
}

export async function mauReport(db: Db, orgId: string, now = new Date()): Promise<MauReport> {
  const plan = effectivePlan(await db.getEntitlement(orgId), now.getTime());
  const period = periodOf(now);
  const used = await db.getUsage(orgId, "mau", period);
  const included = plan.limits.mau;
  const cap = await overageCapUsd(db, orgId, now);
  const allowed = included + Math.floor(cap / OVERAGE_USD_PER_MAU);
  const over = Math.max(0, used - included);
  return {
    period, plan: plan.id, used, included, allowed, overCap: cap, overageUsd: Number((over * OVERAGE_USD_PER_MAU).toFixed(4)), billed: false,
    limited: used >= allowed,
  };
}

/** At the limit new downloads pause (pointer `limited`); installed apps keep their current bundle. */
export async function orgLimited(db: Db, orgId: string, now = new Date()): Promise<boolean> {
  return (await mauReport(db, orgId, now)).limited;
}

export async function storageBytes(db: Db, orgId: string): Promise<number> {
  let total = 0;
  for (const a of await db.listApps(orgId)) for (const b of await db.listBundles(a.id, 5000)) total += b.sizeBytes;
  return total;
}

export async function storageState(db: Db, orgId: string, now = new Date()): Promise<UsageState & { bytes: number }> {
  const plan = effectivePlan(await db.getEntitlement(orgId), now.getTime());
  const bytes = await storageBytes(db, orgId);
  return { ...usageState("storage_gib", Number((bytes / GIB).toFixed(2)), plan.limits.storage_gib), bytes };
}

/** Days raw events are kept for this org's plan. */
export async function eventRetentionDays(db: Db, orgId: string, now = new Date()): Promise<number> {
  return effectivePlan(await db.getEntitlement(orgId), now.getTime()).limits.event_days;
}

export const crossedThresholds = (used: number, limit: number): NoticeThreshold[] =>
  limit <= 0 ? [] : NOTICE_THRESHOLDS.filter((t) => used * 100 >= t * limit);
