import { getAuth } from "@/lib/auth";
import type { Recipients } from "./index";

interface Adapter {
  findMany<T>(a: { model: string; where?: { field: string; value: unknown }[]; limit?: number }): Promise<T[]>;
  findOne<T>(a: { model: string; where: { field: string; value: unknown }[] }): Promise<T | null>;
}

/** Reads memberships straight from Better Auth's adapter (no session needed: used by cron and the update path). */
async function memberEmails(orgId: string, only?: (role: string) => boolean): Promise<string[]> {
  const ctx = await (await getAuth()).$context;
  const adapter = ctx.adapter as unknown as Adapter;
  const rows = await adapter.findMany<{ userId: string; role: string }>({ model: "member", where: [{ field: "organizationId", value: orgId }], limit: 500 });
  const out: string[] = [];
  for (const m of rows) {
    if (only && !only(m.role ?? "")) continue;
    const u = await adapter.findOne<{ email?: string }>({ model: "user", where: [{ field: "id", value: m.userId }] });
    if (u?.email) out.push(u.email.toLowerCase());
  }
  return out;
}

const isRole = (role: string, r: string) => role.split(",").includes(r);

export const authRecipients: Recipients = {
  async owners(orgId) {
    const owners = await memberEmails(orgId, (r) => isRole(r, "owner"));
    return owners.length ? owners : memberEmails(orgId, (r) => isRole(r, "admin"));
  },
  members: (orgId) => memberEmails(orgId),
};
