import { withApi } from "@/lib/http";
import { createMemoryDb } from "@/lib/db/memory";
import { kekFromEnv } from "@/lib/crypto/secretbox";
import { createMemoryStore, type MemoryStore } from "@/lib/storage/memory";
import { emitEvent } from "@/lib/webhooks/outbound";
import { handleShip, type Authenticate } from "@/lib/ship/router";
import type { Principal, ShipDeps } from "@/lib/ship/types";
import { HttpError } from "@/lib/http";
import type { Db } from "@/lib/db/types";

export const BASE = "https://api.test";

export interface Harness {
  deps: ShipDeps & { db: Db; store: MemoryStore };
  clock: { now: Date };
  webhooks: { url: string; body: string; headers: Record<string, string> }[];
  /** Fetch that runs requests through the same router the Next catch-all uses. Counts bytes sent. */
  fetch: typeof fetch;
  wire: { bytes: number; calls: string[] };
  principals: Record<string, Principal>;
  call: (key: string, method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
}

export const ORG_A = "org-a";
export const ORG_B = "org-b";

export function harness(): Harness {
  const db = createMemoryDb("hotrail");
  const store = createMemoryStore(BASE);
  const clock = { now: new Date("2026-11-05T12:00:00Z") };
  const webhooks: Harness["webhooks"] = [];
  const hookFetch = (async (url: string, init: RequestInit) => {
    webhooks.push({ url, body: String(init.body), headers: Object.fromEntries(Object.entries(init.headers as Record<string, string>)) });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  const deps = {
    db, store, kek: () => kekFromEnv({ NODE_ENV: "test", BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret" }),
    emit: (orgId: string, event: string, data: unknown) => emitEvent(orgId, event, data, { db, fetchFn: hookFetch, now: clock.now }),
    now: () => clock.now, uploadSecret: "upload-secret", baseUrl: BASE,
  } as Harness["deps"];
  const principals: Record<string, Principal> = {
    all: { orgId: ORG_A, scope: "all", actor: "key:all" },
    upload: { orgId: ORG_A, scope: "upload", actor: "key:upload" },
    read: { orgId: ORG_A, scope: "read", actor: "key:read" },
    other: { orgId: ORG_B, scope: "all", actor: "key:other" },
  };
  const authenticate: Authenticate = async (req) => {
    const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const p = principals[key.replace(/^hr_/, "")];
    if (!p) throw new HttpError(401, "invalid_api_key");
    return { ...p };
  };
  const wire = { bytes: 0, calls: [] as string[] };
  const handler = withApi(async (req: Request) => handleShip(req, new URL(req.url).pathname.replace(/^\/api\/v1\//, "").split("/"), deps, authenticate), { csrf: false });
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = init.body as Uint8Array | string | undefined;
    wire.bytes += body === undefined ? 0 : typeof body === "string" ? new TextEncoder().encode(body).length : body.byteLength;
    wire.calls.push(`${init.method ?? "GET"} ${new URL(url).pathname}`);
    return handler(new Request(url, init), undefined);
  }) as typeof fetch;
  const call: Harness["call"] = async (key, method, path, body) => {
    const res = await f(`${BASE}/api/v1/${path}`, {
      method, headers: { authorization: `Bearer hr_${key}`, "content-type": "application/json" },
      body: body === undefined ? undefined : body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { deps, clock, webhooks, fetch: f, wire, principals, call };
}

/** Deterministic non-repeating bytes so zip deflate cannot shrink them to nothing. */
export function noise(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 0xff; }
  return out;
}
