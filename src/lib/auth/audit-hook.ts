import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { getDb } from "@/lib/db";
import { log } from "@/lib/logger";

// Key and member changes go through Better Auth's own endpoints, so they are audited from one after hook
// instead of at every call site. The mapping is a pure function so it can be tested without a server.

const MAP: Record<string, { action: string; target: (b: Body) => string | null }> = {
  "/api-key/create": { action: "apikey.created", target: (b) => str(b.name) },
  "/api-key/update": { action: "apikey.updated", target: (b) => str(b.keyId) },
  "/api-key/delete": { action: "apikey.deleted", target: (b) => str(b.keyId) },
  "/organization/invite-member": { action: "member.invited", target: (b) => str(b.email) },
  "/organization/cancel-invitation": { action: "member.invitation_canceled", target: (b) => str(b.invitationId) },
  "/organization/accept-invitation": { action: "member.joined", target: (b) => str(b.invitationId) },
  "/organization/remove-member": { action: "member.removed", target: (b) => str(b.memberIdOrEmail) },
  "/organization/update-member-role": { action: "member.role_changed", target: (b) => str(b.memberId) },
  "/organization/leave": { action: "member.left", target: (b) => str(b.organizationId) },
};

type Body = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 200) : null);

export interface AuditCall { path: string; body: unknown; userId: string | null; activeOrgId: string | null }
export interface AuthAudit { orgId: string; actorId: string | null; action: string; target: string | null; meta: Record<string, string | null> }

export function auditForAuthCall(c: AuditCall): AuthAudit | null {
  const m = MAP[c.path];
  if (!m) return null;
  const body = (c.body && typeof c.body === "object" ? c.body : {}) as Body;
  const orgId = str(body.organizationId) ?? c.activeOrgId;
  if (!orgId) return null;
  const meta: Record<string, string | null> = {};
  if (typeof body.role === "string") meta.role = body.role.slice(0, 64);
  if (typeof body.scope === "string") meta.scope = body.scope.slice(0, 32);
  return { orgId, actorId: c.userId ? `user:${c.userId}` : null, action: m.action, target: m.target(body), meta };
}

export const auditHook = createAuthMiddleware(async (ctx) => {
  try {
    if (!MAP[ctx.path] || isAPIError(ctx.context.returned)) return;
    const s = ctx.context.session ?? ctx.context.newSession ?? (await getSessionFromCtx(ctx).catch(() => null));
    const a = auditForAuthCall({
      path: ctx.path, body: ctx.body, userId: s?.user?.id ?? null,
      activeOrgId: (s?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null,
    });
    if (a) await (await getDb()).appendAudit({ orgId: a.orgId, actorId: a.actorId, action: a.action, target: a.target, meta: a.meta });
  } catch (e) {
    log.warn("auth_audit_failed", { message: (e as Error).message });
  }
});
