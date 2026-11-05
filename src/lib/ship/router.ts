import { z } from "zod";
import { clientIp, HttpError, json } from "@/lib/http";
import { listAppsFor } from "./apps-list";
import { requireApp, requireScope } from "./guard";
import { buildLine, lampOf } from "./line";
import { deleteBundle } from "./bundles";
import { findDevice } from "./devices";
import { listNativeBuilds, registerNativeBuild } from "./native";
import { releaseBundle, rollbackChannel, setChannelPaused } from "./release";
import { usageSeries } from "./usage";
import { acceptBlob, finalizeBundle, planBundle, uploadZipBundle } from "./upload";
import { MAX_BUNDLE_BYTES, type Principal, type ShipDeps } from "./types";

export type Authenticate = (req: Request) => Promise<Principal>;

const MAX_PLAN_BODY = 8 * 1024 * 1024; // a 20,000 file manifest

async function readBody<T>(req: Request, schema: z.ZodType<T>, limit = MAX_PLAN_BODY): Promise<T> {
  if (Number(req.headers.get("content-length") ?? 0) > limit) throw new HttpError(413, "body_too_large");
  let data: unknown;
  try {
    const text = await req.text();
    if (text.length > limit) throw new HttpError(413, "body_too_large");
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "bad_json");
  }
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "invalid_input", r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const version = z.string().min(1).max(64);
const appId = z.string().min(3).max(128);
const manifestSchema = z.object({
  schema: z.literal(1),
  appId,
  version,
  headcode: z.string().optional(),
  nativeFingerprint: z.string().max(256),
  files: z.array(z.object({ path: z.string().min(1).max(512), sha256: sha, size: z.number().int().nonnegative() })).max(20_000),
  createdAt: z.string(),
});
const nativeInfoSchema = z.object({ capacitor: z.string().max(32), plugins: z.record(z.string().max(128), z.string().max(64)) });
const planSchema = z.object({
  appId, version, manifest: manifestSchema, signature: z.string().max(200).nullable().optional().transform((v) => v ?? null),
  publicKey: z.string().max(100).optional(), nativeBuilds: z.array(z.string().max(32)).max(50).optional(),
  native: nativeInfoSchema.optional(),
});
const registerBuildSchema = z.object({ appId, versionBuild: z.string().min(1).max(32), native: nativeInfoSchema, platform: z.enum(["all", "ios", "android"]).optional() });
const finalizeSchema = z.object({ appId, version });
const releaseSchema = z.object({
  appId, channel: z.string().min(1).max(32), bundle: z.string().max(8).optional(), version: version.optional(),
  percent: z.number().min(0).max(100).optional(), autopauseThreshold: z.number().min(0).max(1).optional(),
});
const channelRef = z.object({ appId, channel: z.string().min(1).max(32) });

function parseNativeParam(raw: string | null): { capacitor: string; plugins: Record<string, string> } | undefined {
  if (!raw) return undefined;
  try {
    const r = nativeInfoSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : undefined;
  } catch { return undefined; }
}

export interface RouterOptions {
  /** Called after authentication, before the handler (per key rate limit). */
  rateLimit?: (p: Principal) => Promise<void>;
}

/**
 * Framework free router for `/api/v1/<segments>`. The Next catch-all route and the in-process contract tests both
 * call this, so the CLI is tested against the same code that serves production.
 */
export async function handleShip(req: Request, segments: string[], deps: ShipDeps, authenticate: Authenticate, opts: RouterOptions = {}): Promise<Response> {
  const [a, b, c] = segments;
  const method = req.method.toUpperCase();
  const url = new URL(req.url);

  // Signed blob PUT: the signature in the URL is the credential (no API key; the CLI sends none to storage).
  if (a === "upload" && b === "blob" && c && method === "PUT") {
    const body = new Uint8Array(await req.arrayBuffer());
    await acceptBlob(deps, {
      appDocId: url.searchParams.get("app") ?? "", sha: c, size: Number(url.searchParams.get("size")),
      exp: Number(url.searchParams.get("exp")), sig: url.searchParams.get("sig") ?? "",
    }, body);
    return json({ ok: true });
  }

  const p = await authenticate(req);
  await opts.rateLimit?.(p);
  p.ip ??= clientIp(req);

  if (a === "apps" && !b && method === "GET") {
    requireScope(p, "read");
    return json({ apps: await listAppsFor(deps, p) });
  }
  if (a === "line" && !b && method === "GET") {
    return json(await buildLine(deps, p, url.searchParams.get("appId") ?? ""));
  }
  if (a === "upload" && b === "plan" && method === "POST") return json(await planBundle(deps, p, await readBody(req, planSchema)));
  if (a === "upload" && b === "finalize" && method === "POST") return json(await finalizeBundle(deps, p, await readBody(req, finalizeSchema, 10_000)));

  if (a === "bundles" && !b && method === "POST") {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_BUNDLE_BYTES) throw new HttpError(413, "bundle_too_large", { limit: MAX_BUNDLE_BYTES });
    const zip = new Uint8Array(await req.arrayBuffer());
    const res = await uploadZipBundle(deps, p, {
      appId: url.searchParams.get("appId") ?? "", version: url.searchParams.get("version") ?? "", zip,
      nativeFingerprint: url.searchParams.get("nativeFingerprint") ?? undefined,
      nativeBuilds: url.searchParams.get("nativeBuilds")?.split(",").filter(Boolean),
      native: parseNativeParam(url.searchParams.get("native")),
    });
    return json(res, 201);
  }
  if (a === "bundles" && !b && method === "GET") {
    requireScope(p, "read");
    const line = await buildLine(deps, { ...p, scope: "all" }, url.searchParams.get("appId") ?? "");
    return json({ bundles: line.bundles });
  }

  if (a === "bundles" && !b && method === "DELETE") {
    return json(await deleteBundle(deps, p, { appId: url.searchParams.get("appId") ?? "", bundle: url.searchParams.get("bundle") ?? "" }));
  }
  if (a === "native-builds" && !b && method === "POST") return json(await registerNativeBuild(deps, p, await readBody(req, registerBuildSchema, 100_000)), 201);
  if (a === "native-builds" && !b && method === "GET") return json(await listNativeBuilds(deps, p, url.searchParams.get("appId") ?? ""));
  if (a === "usage" && !b && method === "GET") {
    return json(await usageSeries(deps, p, { appId: url.searchParams.get("appId") ?? "", hours: Number(url.searchParams.get("hours") ?? 24) }));
  }
  if (a === "devices" && !b && method === "GET") {
    return json(await findDevice(deps, p, { appId: url.searchParams.get("appId") ?? "", q: url.searchParams.get("q") ?? "" }));
  }

  if (a === "channels" && !b && method === "GET") {
    requireScope(p, "read");
    const app = await requireApp(deps, p, url.searchParams.get("appId") ?? "");
    const [channels, bundles] = await Promise.all([deps.db.listChannels(app.id), deps.db.listBundles(app.id, 200)]);
    const byId = new Map(bundles.map((x) => [x.id, x]));
    return json({
      channels: channels.map((ch) => ({
        name: ch.name, headcode: ch.currentBundleId ? byId.get(ch.currentBundleId)?.headcode ?? null : null,
        version: ch.currentBundleId ? byId.get(ch.currentBundleId)?.version ?? null : null,
        percent: ch.rolloutPercent, paused: ch.paused, lamp: lampOf(ch),
      })),
    });
  }
  if (a === "channels" && b === "release" && method === "POST") return json(await releaseBundle(deps, p, await readBody(req, releaseSchema, 10_000)));
  if (a === "channels" && b === "rollback" && method === "POST") return json(await rollbackChannel(deps, p, await readBody(req, channelRef, 10_000)));
  if (a === "channels" && (b === "pause" || b === "resume") && method === "POST") {
    return json(await setChannelPaused(deps, p, { ...(await readBody(req, channelRef, 10_000)), paused: b === "pause" }));
  }
  throw new HttpError(404, "not_found");
}
