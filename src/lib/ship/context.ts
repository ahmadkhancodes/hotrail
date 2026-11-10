import { headers } from "next/headers";
import { appUrl } from "@/lib/env";
import { getDb } from "@/lib/db";
import { kekFromEnv } from "@/lib/crypto/secretbox";
import { authApiKey, getOrgContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { assertSameOrigin, HttpError } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";
import { getStore } from "@/lib/storage";
import { sendMailSafe } from "@/lib/mail";
import { log } from "@/lib/logger";
import { createNotifier } from "@/lib/notify";
import { authRecipients } from "@/lib/notify/recipients";
import { emitEvent } from "@/lib/webhooks/outbound";
import type { Authenticate, RouterOptions } from "./router";
import type { Principal, ShipDeps } from "./types";

/** Signs the API's own blob upload URLs. A guessable fallback would let anyone write blobs, so production requires the secret. */
export function uploadSecret(e: Record<string, string | undefined> = process.env): string {
  if (e.BETTER_AUTH_SECRET) return e.BETTER_AUTH_SECRET;
  if (e.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is not set");
  return "dev-upload-secret";
}

/** Real dependencies for the Node routes. Tests build their own ShipDeps (memory db and store, fixed clock). */
export async function shipDeps(): Promise<ShipDeps> {
  const db = await getDb();
  let kek: Promise<CryptoKey> | null = null;
  return {
    db,
    store: await getStore(),
    kek: () => (kek ??= kekFromEnv()),
    emit: (orgId, event, data) => emitEvent(orgId, event, data, { db }),
    now: () => new Date(),
    uploadSecret: uploadSecret(),
    baseUrl: appUrl(),
    notify: createNotifier({ db, recipients: authRecipients, send: (m) => sendMailSafe(m), baseUrl: appUrl(), log: (m, meta) => log.warn(m, meta) }),
  };
}

/** API key (x-api-key or Bearer) for the CLI and CI; otherwise the console session, mapped to read or all by role. */
export const authenticateRequest: Authenticate = async (req) => {
  if (req.headers.get("x-api-key") || req.headers.get("authorization")) {
    const k = await authApiKey(req);
    return { orgId: k.orgId, scope: k.scope, actor: `key:${k.keyId}` } satisfies Principal;
  }
  assertSameOrigin(req); // cookie session: state changing requests must come from our own origin
  const ctx = await getOrgContext(await headers());
  if (!ctx) throw new HttpError(401, "unauthorized");
  return { orgId: ctx.org.id, scope: can(ctx.role, "data", "write") ? "all" : "read", actor: `user:${ctx.user.id}` };
};

export const routerOptions = (db: ShipDeps["db"]): RouterOptions => ({
  rateLimit: async (p) => { await enforceRateLimit(`api:${p.actor}`, RULES.api, db); },
});
