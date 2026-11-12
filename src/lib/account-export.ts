import { can } from "@/lib/auth/roles";

/**
 * The personal export must not be a side door around role checks (SECURITY-REVIEW S-5): the audit log (with IPs) needs
 * `audit:read` and the billing records need `billing:read`, exactly as on their own pages.
 */
export function orgExportFor(role: string | null, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!can(role, "audit", "read")) delete out.auditLog;
  if (!can(role, "billing", "read")) { delete out.billingAccount; delete out.entitlement; }
  if (!can(role, "webhook", "read")) delete out.webhookEndpoints;
  return out;
}
