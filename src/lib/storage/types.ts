// BundleStore: where bundle bytes, manifests and channel pointers live. R2 in production (S3 API),
// memory or filesystem in dev and tests. Keys are slash separated, never start with a slash.
// Moving to any other S3 compatible store (or a VPS disk) means adding one implementation of this interface.

export interface PutOptions {
  contentType?: string;
  /** Sent as Cache-Control on the stored object (pointers use max-age=5). */
  cacheControl?: string;
}

export interface BundleStore {
  readonly kind: "memory" | "fs" | "r2" | "mongo";
  put(key: string, data: Uint8Array, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** URL a device can download from (CDN host for R2, our own /api/v1/files route otherwise). */
  publicUrl(key: string): string;
  /** Presigned PUT straight to the store, or null when the store cannot (the API then issues its own signed URL). */
  presignPut(key: string, opts: { expiresInS: number; contentType?: string }): Promise<{ url: string; headers?: Record<string, string> } | null>;
}

export const textBytes = (s: string): Uint8Array => new TextEncoder().encode(s);
export const bytesText = (b: Uint8Array): string => new TextDecoder().decode(b);

export async function putJson(store: BundleStore, key: string, value: unknown, opts: PutOptions = {}): Promise<void> {
  await store.put(key, textBytes(JSON.stringify(value)), { contentType: "application/json", ...opts });
}

export async function getJson<T>(store: BundleStore, key: string): Promise<T | null> {
  const b = await store.get(key);
  if (!b) return null;
  try { return JSON.parse(bytesText(b)) as T; } catch { return null; }
}

const SAFE_KEY = /^[A-Za-z0-9._\-/]+$/;
export function assertKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("//") || !SAFE_KEY.test(key)) throw new Error(`unsafe storage key: ${key}`);
  return key;
}
