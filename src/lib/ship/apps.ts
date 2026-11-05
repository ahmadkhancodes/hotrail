import { generateSigningKeyPair } from "@buffersol/hotrail-core";
import { effectivePlan } from "@/lib/billing/entitlement";
import type { AppDoc } from "@/lib/db/types";
import { seal } from "@/lib/crypto/secretbox";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { recordAudit } from "./guard";
import { publishPointers } from "./pointers";
import { DEFAULT_AUTOPAUSE_THRESHOLD, DEFAULT_MIN_SAMPLE, type Principal, type ShipDeps } from "./types";

export const BUNDLE_ID_RE = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+){1,8}$/;
export const FREE_APP_LIMIT = 2;

/**
 * Finds the org's app by Capacitor appId or creates it on first upload with a `production` channel that is the
 * default for iOS and Android. Bundle ids are unique across the product (devices send only that string).
 * Managed apps get an Ed25519 key pair; the private half is sealed with the KEK and never leaves the server.
 */
export async function ensureApp(deps: ShipDeps, p: Principal, bundleId: string, mode: "managed" | "customer"): Promise<AppDoc> {
  if (!BUNDLE_ID_RE.test(bundleId) || bundleId.length > 128) throw new HttpError(400, "invalid_app_id", { hint: "Use your Capacitor appId, for example com.example.ordering." });
  const existing = await deps.db.getAppByBundleId(bundleId);
  if (existing) {
    if (existing.orgId !== p.orgId) throw new HttpError(409, "app_id_taken");
    return existing;
  }
  const ent = await deps.db.getEntitlement(p.orgId);
  if (effectivePlan(ent).id === "free" && (await deps.db.listApps(p.orgId)).length >= FREE_APP_LIMIT) {
    throw new HttpError(402, "plan_limit", { limit: FREE_APP_LIMIT, hint: "The Free plan includes 2 apps. Upgrade to add more." });
  }
  const id = uuidv7();
  let signingPublicKey: string | null = null;
  let signingKeyEnc: string | null = null;
  if (mode === "managed") {
    const kp = await generateSigningKeyPair();
    signingPublicKey = kp.publicKey;
    signingKeyEnc = await seal(kp.privateKey, await deps.kek(), id);
  }
  let app: AppDoc;
  try {
    app = await deps.db.createApp({
      id, orgId: p.orgId, bundleId, name: bundleId.split(".").at(-1) ?? bundleId, signingMode: mode,
      signingPublicKey, signingKeyEnc, compatMode: "native", defaultChannelIds: {},
      autopauseThreshold: DEFAULT_AUTOPAUSE_THRESHOLD, minSample: DEFAULT_MIN_SAMPLE,
    });
  } catch (e) {
    if ((e as Error).message === "duplicate_app") return ensureApp(deps, p, bundleId, mode); // lost a race with a parallel first upload
    throw e;
  }
  const production = await deps.db.createChannel({
    id: uuidv7(), orgId: p.orgId, appId: app.id, name: "production", platform: "all",
    currentBundleId: null, previousBundleId: null, rolloutPercent: 100,
    autopauseThreshold: app.autopauseThreshold, minSample: app.minSample, paused: false, pausedReason: null, protected: false, allowSelfAssign: false,
  });
  app.defaultChannelIds = { ios: production.id, android: production.id };
  await deps.db.updateApp(app.id, { defaultChannelIds: app.defaultChannelIds });
  await recordAudit(deps, p, "app.created", app.bundleId, { appId: app.id, signingMode: mode });
  await publishPointers(deps, app);
  return app;
}
