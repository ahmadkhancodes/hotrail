import type { Db } from "@/lib/db/types";
import type { BundleStore } from "@/lib/storage/types";

/** Who is calling. `scope` comes from the API key (metadata.scope) or, for the console, from the member's role. */
export interface Principal {
  orgId: string;
  scope: "upload" | "read" | "all";
  /** Stable audit actor: `user:<id>` or `key:<id>`. */
  actor: string;
  ip?: string | null;
}

export interface ShipDeps {
  db: Db;
  store: BundleStore;
  /** Key encryption key for per-app signing keys. */
  kek: () => Promise<CryptoKey>;
  /** Fire a signed outbound webhook (kit). Failures never break the action. */
  emit: (orgId: string, event: string, data: unknown) => Promise<unknown>;
  now: () => Date;
  /** HMAC secret for the API's own signed blob upload URLs. */
  uploadSecret: string;
  baseUrl: string;
  /** Usage and release emails (never throws into the caller). Optional so tests can omit it. */
  notify?: import("@/lib/notify").Notifier;
}

export const MAX_BUNDLE_BYTES = 150 * 1024 * 1024; // what one function invocation assembles in memory
export const BLOB_URL_TTL_S = 15 * 60;
export const DEFAULT_AUTOPAUSE_THRESHOLD = 0.05;
export const DEFAULT_MIN_SAMPLE = 20;

export const keys = {
  blob: (appDocId: string, sha: string) => `blobs/${appDocId}/${sha}`,
  manifest: (appDocId: string, bundleDocId: string) => `manifests/${appDocId}/${bundleDocId}.json`,
  zip: (appDocId: string, bundleDocId: string) => `zips/${appDocId}/${bundleDocId}.zip`,
  pending: (appDocId: string, version: string) => `pending/${appDocId}/${version.replace(/[^A-Za-z0-9._-]/g, "_")}.json`,
  ptrIndex: (bundleId: string) => `ptr/${bundleId}/index.json`,
  ptrChannel: (bundleId: string, channelId: string) => `ptr/${bundleId}/${channelId}.json`,
};

/** Only these prefixes are served by the public files route. */
export const PUBLIC_PREFIXES = ["zips/", "manifests/", "blobs/"];
