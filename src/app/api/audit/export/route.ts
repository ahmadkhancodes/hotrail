import { requireOrg, requirePermission } from "@/lib/auth/session";
import { auditToCsv, collectAudit } from "@/lib/audit-csv";
import { getDb } from "@/lib/db";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const date = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);

/** CSV of the audit log, newest first (up to 10,000 rows). `?from=` and `?to=` take ISO dates. Owners and admins only. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "audit", "read");
  const q = new URL(req.url).searchParams;
  const db = await getDb();
  const { entries, truncated } = await collectAudit((o) => db.listAudit(ctx.org.id, o), { from: date(q.get("from")), to: date(q.get("to")) });
  return new Response(auditToCsv(entries), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hotrail-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
      "x-truncated": truncated ? "1" : "0",
    },
  });
});
