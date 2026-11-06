import { requireOrg, requirePermission } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { mauReport, overageCapUsd, setOverageCapUsd } from "@/lib/billing/limits";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { shipDeps } from "@/lib/ship/context";
import { evaluateMauNotices } from "@/lib/ship/metering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const ctx = await requireOrg();
  const db = await getDb();
  return json({ report: await mauReport(db, ctx.org.id), capUsd: await overageCapUsd(db, ctx.org.id) });
});

/** Owner sets the monthly cap for extra MAU in whole dollars (0 turns overage off). Paid plans only. */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "billing", "manage");
  const db = await getDb();
  const body = await readJson<{ capUsd?: unknown }>(req);
  const cap = Number(body.capUsd);
  if (!Number.isFinite(cap) || cap < 0 || cap > 100_000) throw new HttpError(400, "invalid_input", { message: "Enter a whole dollar amount from 0 to 100000." });
  if (cap > 0 && effectivePlan(await db.getEntitlement(ctx.org.id)).id === "free") throw new HttpError(402, "plan_required", { message: "Overage is available on paid plans." });
  await setOverageCapUsd(db, ctx.org.id, cap);
  await db.appendAudit({ orgId: ctx.org.id, actorId: `user:${ctx.user.id}`, action: "billing.overage_cap_set", target: ctx.org.id, meta: { capUsd: Math.floor(cap) } });
  // A new cap can lift or apply the download pause immediately.
  await evaluateMauNotices(await shipDeps(), ctx.org.id);
  return json({ report: await mauReport(db, ctx.org.id), capUsd: await overageCapUsd(db, ctx.org.id) });
});
