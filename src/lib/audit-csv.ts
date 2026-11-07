import type { AuditEntry } from "@/lib/db/types";

/** Quote a CSV cell (RFC 4180) and neutralise spreadsheet formulas (a leading = + - @ tab or CR becomes text). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const AUDIT_CSV_HEADER = ["time_utc", "action", "actor", "target", "ip", "details"];

export function auditToCsv(entries: AuditEntry[]): string {
  const rows = entries.map((e) => [e.at.toISOString(), e.action, e.actorId ?? "system", e.target ?? "", e.ip ?? "", e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : ""]);
  return [AUDIT_CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const AUDIT_EXPORT_MAX = 10_000;

/** Pages through the log newest first. `from` and `to` are optional bounds (inclusive start, exclusive end). */
export async function collectAudit(
  list: (o: { limit: number; before?: Date }) => Promise<AuditEntry[]>,
  opts: { from?: Date; to?: Date; max?: number } = {},
): Promise<{ entries: AuditEntry[]; truncated: boolean }> {
  const max = opts.max ?? AUDIT_EXPORT_MAX;
  const out: AuditEntry[] = [];
  let before = opts.to;
  while (out.length < max) {
    const page = await list({ limit: 200, before });
    if (page.length === 0) break;
    for (const e of page) {
      if (opts.from && e.at < opts.from) return { entries: out, truncated: false };
      if (out.length >= max) return { entries: out, truncated: true };
      out.push(e);
    }
    before = page[page.length - 1]!.at;
    if (page.length < 200) break;
  }
  return { entries: out, truncated: out.length >= max };
}
