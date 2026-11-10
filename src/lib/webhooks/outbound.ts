import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type Db, type WebhookDelivery, type WebhookEndpoint } from "@/lib/db/types";
import { hmacSha256Hex, randomToken, uuidv7 } from "@/lib/ids";
import { product } from "@/config/product";

// Outbound webhooks: HMAC-SHA256 signed (Stripe-style header), retries with exponential backoff, delivery log.
// Header: `X-Webhook-Signature: t=<unix>,v1=<hex hmac of "t.body">`, plus X-Webhook-Id / X-Webhook-Event.

export const MAX_ATTEMPTS = 8;
/** Backoff after attempt n (1-based): 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h (+-10% jitter). */
const BACKOFF_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]! * 1000;
  return Math.round(base * (0.9 + rand() * 0.2));
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export async function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

/** For receivers and tests: verify a signature header with a 5 minute tolerance. */
export async function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceS = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceS) return false;
  return parts.v1 === (await hmacSha256Hex(secret, `${t}.${body}`));
}

/** Queue an event to every enabled endpoint subscribed to it (or to "*"), and try once immediately. */
export async function emitEvent(orgId: string, event: string, data: unknown, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const eps = (await db.listWebhookEndpoints(orgId)).filter((e) => e.enabled && (e.events.includes("*") || e.events.includes(event)));
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    const id = uuidv7();
    const payload = JSON.stringify({ id, type: event, created: Math.floor(now.getTime() / 1000), data });
    const d: WebhookDelivery = {
      id, app: db.app, orgId, endpointId: ep.id, event, payload, status: "pending", attempts: 0,
      nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now,
      expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
    };
    await db.createDelivery(d);
    out.push(await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now }));
  }
  return out;
}

export async function attemptDelivery(
  d: WebhookDelivery,
  ep: WebhookEndpoint,
  opts: { db: Db; fetchFn?: typeof fetch; now?: Date; resolveCheck?: (url: string) => Promise<boolean> },
): Promise<WebhookDelivery> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  try {
    // Real sends re-check the resolved address; tests that inject fetchFn opt in with resolveCheck.
    const check = opts.resolveCheck ?? (opts.fetchFn ? null : resolvesToPublicHost);
    if (check && !(await check(ep.url))) throw Object.assign(new Error("blocked"), { name: "BlockedError" });
    const ctrl = AbortSignal.timeout(10_000);
    const res = await fetchFn(ep.url, {
      method: "POST",
      signal: ctrl,
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "user-agent": `${product.name}-Webhooks/1.0`,
        "x-webhook-id": d.id,
        "x-webhook-event": d.event,
        "x-webhook-signature": await signPayload(ep.secret, d.payload, Math.floor(now.getTime() / 1000)),
      },
      body: d.payload,
    });
    code = res.status;
    if (!res.ok) error = `http_${res.status}`;
  } catch (e) {
    error = (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).name === "BlockedError" ? "blocked_address" : "network_error";
  }
  const ok = !error;
  const patch: Partial<WebhookDelivery> = {
    attempts,
    lastStatusCode: code,
    lastError: error,
    updatedAt: now,
    status: ok ? "succeeded" : attempts >= MAX_ATTEMPTS ? "failed" : "retrying",
    nextAttemptAt: ok || attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
  };
  await opts.db.updateDelivery(d.id, patch);
  return { ...d, ...patch };
}

/** Cron job: retry due deliveries. */
export async function retryDueDeliveries(opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; limit?: number } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const due = await db.dueDeliveries(now, opts.limit ?? 50);
  let ok = 0;
  for (const d of due) {
    const ep = await db.getWebhookEndpoint(d.orgId, d.endpointId);
    if (!ep || !ep.enabled) {
      await db.updateDelivery(d.id, { status: "failed", lastError: "endpoint_disabled", nextAttemptAt: null, updatedAt: now });
      continue;
    }
    const r = await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now });
    if (r.status === "succeeded") ok++;
  }
  return { processed: due.length, succeeded: ok };
}

/** True for loopback, private, link-local, CGNAT, unspecified and multicast addresses (v4, v6 and v4-mapped v6). */
export function isPrivateIp(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateIp(mapped[1]!);
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (m) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    return x === 0 || x === 10 || x === 127 || x >= 224 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 192 && y === 0) || (x === 198 && (y === 18 || y === 19));
  }
  if (a.includes(":")) return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("ff");
  return true; // not an IP literal: treat as unsafe
}

/** Resolve the host at send time (defeats DNS names that point inward and rebinding after the save-time check). */
export async function resolvesToPublicHost(raw: string): Promise<boolean> {
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !isPrivateIp(host);
  const { lookup } = await import("node:dns/promises");
  const addrs = await lookup(host, { all: true });
  return addrs.length > 0 && addrs.every((x) => !isPrivateIp(x.address));
}

/** Block private/loopback targets (SSRF) for user-supplied webhook URLs. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^[\d.]+$/.test(h) && isPrivateIp(h)) return false;
  if (h.startsWith("[") || h === "::1") return false;
  return true;
}
