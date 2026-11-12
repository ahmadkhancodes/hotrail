import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Db } from "@/lib/db/types";
import { rateLimit, RULES } from "@/lib/security/ratelimit";

// Better Auth limits requests per IP only, and the client IP comes from a header. Someone with many IPs could send
// one inbox an unlimited number of sign-in or invite emails (SECURITY-REVIEW S-3). This caps mail per recipient address.

const LIMITED: Record<string, string> = {
  "/sign-in/magic-link": "Too many sign-in links were sent to this address. Wait 10 minutes and try again.",
  "/organization/invite-member": "Too many invitations were sent to this address. Wait 10 minutes and try again.",
};

/** Pure check so it can be tested without a server. Returns the refusal message, or null when the mail may go out. */
export async function emailLimitFor(path: string, body: unknown, db?: Db): Promise<string | null> {
  const message = LIMITED[path];
  if (!message) return null;
  const raw = (body as { email?: unknown } | null)?.email;
  if (typeof raw !== "string" || !raw.trim()) return null; // the endpoint's own validation rejects it
  const email = raw.trim().toLowerCase().slice(0, 320);
  const r = await rateLimit(`mail-to:${path}:${email}`, RULES.authEmail, db);
  return r.ok ? null : message;
}

export const magicLinkEmailLimit = createAuthMiddleware(async (ctx) => {
  const refused = await emailLimitFor(ctx.path, ctx.body);
  if (refused) throw new APIError("TOO_MANY_REQUESTS", { message: refused, code: "TOO_MANY_EMAILS" });
});
