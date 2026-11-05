// The one app-data interface (ported from trayo server/db/Db.ts; sync/family/anonymous removed).
// Users, sessions, orgs, members and API keys belong to Better Auth (its own adapter, same database).
// Billing is per organization ("subject" = org id). Every document carries `app` so a shared cluster stays safe.
// TTL fields are BSON Dates (the apps stored numbers, so Mongo TTL never fired: BACKEND_REUSE 1.5).

import type { PlanId } from "@/config/product";

export type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "lifetime";

export interface Entitlement {
  /** Paid plan is live (trialing/active/past_due within grace, or lifetime). */
  isPaid: boolean;
  status: EntitlementStatus;
  plan: PlanId;
  interval: "month" | "year" | null;
  /** ms epoch; checked at read time so a missed webhook cannot leave a plan on forever. */
  expiresAt: number | null;
  trialStartedAt: number | null;
  cancelAtPeriodEnd: boolean;
  checkedAt: number;
  trialUsed: boolean;
  subscriptionId: string | null;
  lifetimePaymentIntentId: string | null;
  /** First time we saw past_due (for grace-period display). */
  pastDueSince: number | null;
}

export interface BillingAccount {
  /** org id */
  id: string;
  app: string;
  stripeCustomerId: string | null;
  email: string | null;
  createdAt: Date;
}

export interface AuditEntry {
  id: string;
  app: string;
  orgId: string | null;
  actorId: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  ip?: string | null;
  at: Date;
}

export interface WebhookEndpoint {
  id: string;
  app: string;
  orgId: string;
  url: string;
  /** Signing secret (whsec_...). Shown once on create. */
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
}

export type DeliveryStatus = "pending" | "succeeded" | "failed" | "retrying";

export interface WebhookDelivery {
  id: string;
  app: string;
  orgId: string;
  endpointId: string;
  event: string;
  payload: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** TTL: delivery logs expire (Date, not number). */
  expireAt: Date;
}

export interface Suppression {
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
  scope: string; // "all" or a list/category id
  at: Date;
}

export interface Db extends ShipDb {
  readonly app: string;

  // billing
  getBillingAccount(orgId: string): Promise<BillingAccount | null>;
  upsertBillingAccount(a: Omit<BillingAccount, "app" | "createdAt"> & { createdAt?: Date }): Promise<void>;
  findBillingAccountByCustomer(customerId: string): Promise<BillingAccount | null>;
  getEntitlement(orgId: string): Promise<Entitlement | null>;
  setEntitlement(orgId: string, e: Entitlement): Promise<void>;
  /** Webhook idempotency: was this event already processed successfully? */
  hasStripeEvent(id: string): Promise<boolean>;
  /** Record AFTER successful processing (fix for BACKEND_REUSE 2.2 #4). Returns false if already recorded. */
  markStripeEvent(id: string, type: string): Promise<boolean>;

  // metering
  incUsage(orgId: string, meter: string, period: string, by?: number): Promise<number>;
  getUsage(orgId: string, meter: string, period: string): Promise<number>;

  // rate limiting (sliding window). Returns hits inside the window INCLUDING this one.
  hitRateLimit(key: string, windowMs: number, now?: number): Promise<number>;

  // audit log (append-only)
  appendAudit(e: Omit<AuditEntry, "id" | "app" | "at"> & { at?: Date }): Promise<AuditEntry>;
  listAudit(orgId: string, opts?: { limit?: number; before?: Date }): Promise<AuditEntry[]>;

  // outbound webhooks
  createWebhookEndpoint(e: Omit<WebhookEndpoint, "app" | "createdAt">): Promise<WebhookEndpoint>;
  listWebhookEndpoints(orgId: string): Promise<WebhookEndpoint[]>;
  getWebhookEndpoint(orgId: string, id: string): Promise<WebhookEndpoint | null>;
  updateWebhookEndpoint(orgId: string, id: string, patch: Partial<Pick<WebhookEndpoint, "url" | "events" | "enabled">>): Promise<void>;
  deleteWebhookEndpoint(orgId: string, id: string): Promise<void>;
  createDelivery(d: Omit<WebhookDelivery, "app">): Promise<void>;
  updateDelivery(id: string, patch: Partial<Omit<WebhookDelivery, "id" | "app" | "orgId">>): Promise<void>;
  listDeliveries(orgId: string, opts?: { endpointId?: string; limit?: number }): Promise<WebhookDelivery[]>;
  getDelivery(orgId: string, id: string): Promise<WebhookDelivery | null>;
  dueDeliveries(now: Date, limit: number): Promise<WebhookDelivery[]>;

  // mail suppression list
  addSuppression(s: Omit<Suppression, "at"> & { at?: Date }): Promise<void>;
  isSuppressed(email: string, scope?: string): Promise<boolean>;
  removeSuppression(email: string, scope?: string): Promise<void>;

  // remote flags
  getConfig(): Promise<Record<string, string>>;
  setConfig(key: string, value: string): Promise<void>;

  // privacy
  exportOrgData(orgId: string): Promise<Record<string, unknown>>;
  deleteOrgData(orgId: string): Promise<void>;
}

export const DELIVERY_TTL_DAYS = 90;

// ---- Ship path (M2): apps, bundles, channels, releases, devices, overrides, events ----
// Every document carries orgId; services check `doc.orgId === principal.orgId` before returning anything.

export type Platform = "ios" | "android";

export interface AppDoc {
  id: string;
  app: string;
  orgId: string;
  /** Capacitor appId (com.example.ordering). Unique across the product: the hot path only receives this string. */
  bundleId: string;
  name: string;
  signingMode: "managed" | "customer";
  /** Ed25519 public key, base64 raw. Null until the first customer-signed upload registers it. */
  signingPublicKey: string | null;
  /** Managed mode only: pkcs8 private key sealed with the KEK (src/lib/crypto/secretbox.ts). */
  signingKeyEnc: string | null;
  compatMode: "native" | "capgo_plugin";
  defaultChannelIds: Partial<Record<Platform, string>>;
  /** Default failure-rate threshold for auto-pause (0..1) and minimum events before it can fire. */
  autopauseThreshold: number;
  minSample: number;
  bundleSeq: number;
  createdAt: Date;
}

export interface BundleDelta {
  baseVersion: string | null;
  changedFiles: number;
  uploadBytes: number;
  totalBytes: number;
  uploadRatio: number;
}

export interface BundleDoc {
  id: string;
  app: string;
  orgId: string;
  appId: string;
  version: string;
  headcode: string;
  nativeFingerprint: string;
  /** Capacitor + plugin versions the bundle was built against (CLI sends it). Lets the console say why a build is refused. */
  nativeInfo?: { capacitor: string; plugins: Record<string, string> } | null;
  manifestKey: string;
  zipKey: string;
  zipSha256: string;
  sizeBytes: number;
  fileCount: number;
  signed: boolean;
  allowedNativeBuilds: string[];
  delta: BundleDelta;
  createdBy: string;
  state: "active" | "softDeleted";
  createdAt: Date;
}

export interface ChannelDoc {
  id: string;
  app: string;
  orgId: string;
  appId: string;
  name: string;
  platform: "all" | Platform;
  currentBundleId: string | null;
  previousBundleId: string | null;
  rolloutPercent: number;
  autopauseThreshold: number;
  minSample: number;
  paused: boolean;
  pausedReason: string | null;
  protected: boolean;
  allowSelfAssign: boolean;
  /** Optimistic concurrency counter: a release carrying a stale rev is refused (409 channel_busy). */
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ReleaseAction = "release" | "percent" | "rollback" | "pause" | "resume" | "autopause";

export interface ReleaseDoc {
  id: string;
  app: string;
  orgId: string;
  appId: string;
  channelId: string;
  channelName: string;
  action: ReleaseAction;
  bundleId: string | null;
  fromBundleId: string | null;
  percent: number;
  actor: string;
  cause: string | null;
  at: Date;
}

/** A store build of the native app (what `version_build` carries), with its native fingerprint. */
export interface NativeBuildDoc {
  app: string;
  appId: string;
  versionBuild: string;
  fingerprint: string;
  info: { capacitor: string; plugins: Record<string, string> };
  platform: "all" | Platform;
  recordedAt: Date;
}

/** Adoption bucket: counts of outcomes per five minutes, channel and bundle version. Matches raw events one to one. */
export interface UsageBucketDoc {
  app: string;
  appId: string;
  /** Start of the five minute window. */
  bucket: Date;
  channelId: string | null;
  bundleVersion: string | null;
  counts: { download: number; applied: number; failed: number; rolledBack: number };
  expiresAt: Date;
}

export const BUCKET_MS = 5 * 60_000;
export const bucketStart = (d: Date) => new Date(Math.floor(d.getTime() / BUCKET_MS) * BUCKET_MS);

export interface DeviceDoc {
  app: string;
  appId: string;
  deviceId: string;
  /** The app's own id for the device (Capgo `custom_id`), searchable in the console. */
  customId?: string | null;
  platform: string;
  bundleVersion: string | null;
  versionBuild: string | null;
  channelId: string | null;
  lastSeenAt: Date;
}

export interface OverrideDoc {
  app: string;
  appId: string;
  deviceId: string;
  channelId: string;
  at: Date;
}

export type EventAction = "download" | "applied" | "failed" | "rolledBack" | "other";

export interface EventDoc {
  id: string;
  app: string;
  appId: string;
  ts: Date;
  deviceId: string;
  bundleVersion: string | null;
  channelId: string | null;
  action: EventAction;
  cause: string;
  /** TTL (Date). */
  expiresAt: Date;
}

export interface ShipDb {
  createApp(a: Omit<AppDoc, "app" | "bundleSeq" | "createdAt"> & { createdAt?: Date }): Promise<AppDoc>;
  getAppByBundleId(bundleId: string): Promise<AppDoc | null>;
  getAppById(id: string): Promise<AppDoc | null>;
  listApps(orgId: string): Promise<AppDoc[]>;
  updateApp(id: string, patch: Partial<Pick<AppDoc, "signingPublicKey" | "defaultChannelIds" | "autopauseThreshold" | "minSample" | "name">>): Promise<void>;
  /** Atomically returns the previous counter value and increments it (0 for the first bundle). */
  nextBundleSeq(appId: string): Promise<number>;

  /** Throws `duplicate_version` when (appId, version) exists. */
  createBundle(b: Omit<BundleDoc, "app">): Promise<BundleDoc>;
  getBundle(appId: string, id: string): Promise<BundleDoc | null>;
  getBundleByVersion(appId: string, version: string): Promise<BundleDoc | null>;
  getBundleByHeadcode(appId: string, headcode: string): Promise<BundleDoc | null>;
  /** Marks a bundle softDeleted (it disappears from lists and lookups). Callers must run the live-channel guard first. */
  softDeleteBundle(appId: string, id: string): Promise<boolean>;
  listBundles(appId: string, limit?: number): Promise<BundleDoc[]>;

  createChannel(c: Omit<ChannelDoc, "app" | "rev" | "createdAt" | "updatedAt">): Promise<ChannelDoc>;
  getChannel(appId: string, id: string): Promise<ChannelDoc | null>;
  getChannelByName(appId: string, name: string): Promise<ChannelDoc | null>;
  listChannels(appId: string): Promise<ChannelDoc[]>;
  /** Channels with a live bundle that are not paused, across all apps (the auto-pause sweep). */
  listLiveChannels(limit?: number): Promise<ChannelDoc[]>;
  /** Compare-and-set on `rev` when expectRev is given. Returns the new doc, or null when the rev was stale or the channel is gone. */
  updateChannel(
    appId: string, id: string,
    patch: Partial<Pick<ChannelDoc, "currentBundleId" | "previousBundleId" | "rolloutPercent" | "autopauseThreshold" | "minSample" | "paused" | "pausedReason" | "allowSelfAssign">>,
    expectRev?: number,
  ): Promise<ChannelDoc | null>;

  appendRelease(r: Omit<ReleaseDoc, "app">): Promise<void>;
  listReleases(appId: string, limit?: number): Promise<ReleaseDoc[]>;

  /** Device registry keeps last-seen only, one document per (appId, deviceId). */
  touchDevice(d: Omit<DeviceDoc, "app">): Promise<void>;
  getDevice(appId: string, deviceId: string): Promise<DeviceDoc | null>;
  getDeviceByCustomId(appId: string, customId: string): Promise<DeviceDoc | null>;
  countDevices(appId: string, since?: Date): Promise<number>;
  /** Device counts grouped by bundle version or channel (devices seen since `since`). */
  deviceCounts(appId: string, by: "bundleVersion" | "channelId" | "versionBuild", since?: Date): Promise<Record<string, number>>;

  setOverride(o: Omit<OverrideDoc, "app" | "at">): Promise<void>;
  deleteOverride(appId: string, deviceId: string): Promise<void>;
  getOverride(appId: string, deviceId: string): Promise<OverrideDoc | null>;
  listOverrides(appId: string, limit?: number): Promise<OverrideDoc[]>;

  appendEvent(e: Omit<EventDoc, "app">): Promise<void>;
  listEvents(appId: string, opts?: { since?: Date; channelId?: string; bundleVersion?: string; deviceId?: string; limit?: number }): Promise<EventDoc[]>;

  /** Adds one outcome to its five minute bucket (upsert + increment). */
  bumpBucket(b: { appId: string; at: Date; channelId: string | null; bundleVersion: string | null; action: "download" | "applied" | "failed" | "rolledBack"; expiresAt: Date }): Promise<void>;
  listBuckets(appId: string, opts: { since: Date; until?: Date }): Promise<UsageBucketDoc[]>;

  /** One row per store build; re-recording the same build replaces it. */
  recordNativeBuild(b: Omit<NativeBuildDoc, "app">): Promise<void>;
  listNativeBuilds(appId: string): Promise<NativeBuildDoc[]>;
}

export const EVENT_TTL_DAYS = 7;
/** Five minute buckets are tiny, so they outlive raw events. */
export const BUCKET_TTL_DAYS = 30;
