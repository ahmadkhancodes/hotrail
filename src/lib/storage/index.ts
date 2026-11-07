import { appUrl } from "@/lib/env";
import { createMemoryStore } from "./memory";
import type { BundleStore } from "./types";

export * from "./types";

declare global {
  var __hotrailStore: BundleStore | undefined;
}

export interface StoreEnv {
  BUNDLE_STORE?: string;
  BUNDLE_STORE_DIR?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_PUBLIC_BASE?: string;
  NODE_ENV?: string;
  DB_DRIVER?: string;
  MONGODB_URI?: string;
}

/**
 * A per-instance memory store next to a real database loses every bundle and pointer on the next cold start while the
 * database still lists them, and each serverless instance sees different pointers. Production refuses that combination
 * (a memory database plus a memory store is a self-consistent demo and stays allowed).
 */
function refuseVolatileStore(e: StoreEnv, why: string): void {
  if (e.NODE_ENV !== "production") return;
  const db = e.DB_DRIVER ?? (e.MONGODB_URI ? "mongo" : "memory");
  if (why === "r2_incomplete" || db !== "memory") {
    throw new Error(`bundle store not configured (${why}): set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY`);
  }
}

/** Picks the store from env. Default is memory whenever the R2 variables are absent. */
export async function storeFromEnv(e: StoreEnv = process.env as StoreEnv, baseUrl = appUrl()): Promise<BundleStore> {
  const wanted = e.BUNDLE_STORE ?? (e.R2_ACCOUNT_ID && e.R2_BUCKET && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY ? "r2" : "memory");
  if (wanted === "r2") {
    if (!(e.R2_ACCOUNT_ID && e.R2_BUCKET && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY)) {
      refuseVolatileStore(e, "r2_incomplete");
      return createMemoryStore(baseUrl);
    }
    const { createR2Store } = await import("./r2");
    return createR2Store({
      accountId: e.R2_ACCOUNT_ID, bucket: e.R2_BUCKET,
      credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
      publicBase: e.R2_PUBLIC_BASE, fallbackBase: baseUrl,
    });
  }
  if (wanted === "fs") {
    const { createFsStore } = await import("./fs");
    return createFsStore(e.BUNDLE_STORE_DIR ?? ".data/bundles", baseUrl);
  }
  if (e.BUNDLE_STORE !== "memory") refuseVolatileStore(e, "no_r2_env");
  return createMemoryStore(baseUrl);
}

export async function getStore(): Promise<BundleStore> {
  return (globalThis.__hotrailStore ??= await storeFromEnv());
}
