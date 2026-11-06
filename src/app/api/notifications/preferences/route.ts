import { z } from "zod";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, readJson, withApi } from "@/lib/http";
import { NOTIFY_KINDS, notifyScope } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["release", "rollback", "autopause"]), enabled: z.boolean() });

/** The signed in member's own email preferences. Everyone starts subscribed. */
export const GET = withApi(async () => {
  const ctx = await requireOrg();
  const db = await getDb();
  const prefs = await Promise.all(NOTIFY_KINDS.map(async (k) => ({ kind: k.kind, enabled: !(await db.isSuppressed(ctx.user.email, notifyScope(k.kind))) })));
  return json({ email: ctx.user.email, prefs });
});

export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  const body = await readJson(req, Body);
  const db = await getDb();
  if (body.enabled) await db.removeSuppression(ctx.user.email, notifyScope(body.kind));
  else await db.addSuppression({ email: ctx.user.email, scope: notifyScope(body.kind), reason: "unsubscribe" });
  return json({ kind: body.kind, enabled: body.enabled });
});
