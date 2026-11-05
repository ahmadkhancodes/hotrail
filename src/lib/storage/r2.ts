import { presignUrl, sha256Hex, signRequest, uriEncode, type Credentials } from "./sigv4";
import { assertKey, type BundleStore } from "./types";

export interface R2Config {
  accountId: string;
  bucket: string;
  credentials: Credentials;
  /** Public CDN base (https://hotrail-cdn.buffersoltech.com). Without it update URLs fall back to `fallbackBase`/api/v1/files. */
  publicBase?: string;
  fallbackBase?: string;
  fetchImpl?: typeof fetch;
  /** Override for tests. */
  endpoint?: string;
}

/** Cloudflare R2 through its S3 API with `fetch` and our own SigV4. Path style, region "auto". */
export function createR2Store(c: R2Config): BundleStore {
  const f = c.fetchImpl ?? fetch;
  const endpoint = (c.endpoint ?? `https://${c.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  const urlFor = (key: string) => `${endpoint}/${c.bucket}/${uriEncode(assertKey(key), true)}`;
  const base = { region: "auto", service: "s3", credentials: c.credentials };

  return {
    kind: "r2",
    async put(key, data, opts = {}) {
      const url = urlFor(key);
      const payloadHash = await sha256Hex(data);
      const extra: Record<string, string> = { "x-amz-content-sha256": payloadHash };
      if (opts.contentType) extra["content-type"] = opts.contentType;
      if (opts.cacheControl) extra["cache-control"] = opts.cacheControl;
      const headers = await signRequest({ ...base, method: "PUT", url, headers: extra, payloadHash });
      const res = await f(url, { method: "PUT", headers, body: data as BodyInit });
      if (!res.ok) throw new Error(`r2 put failed: ${res.status}`);
    },
    async get(key) {
      const url = urlFor(key);
      const headers = await signRequest({ ...base, method: "GET", url, headers: { "x-amz-content-sha256": await sha256Hex("") }, payloadHash: await sha256Hex("") });
      const res = await f(url, { method: "GET", headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`r2 get failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async has(key) {
      const url = urlFor(key);
      const headers = await signRequest({ ...base, method: "HEAD", url, headers: { "x-amz-content-sha256": await sha256Hex("") }, payloadHash: await sha256Hex("") });
      const res = await f(url, { method: "HEAD", headers });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`r2 head failed: ${res.status}`);
      return true;
    },
    async delete(key) {
      const url = urlFor(key);
      const headers = await signRequest({ ...base, method: "DELETE", url, headers: { "x-amz-content-sha256": await sha256Hex("") }, payloadHash: await sha256Hex("") });
      const res = await f(url, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404) throw new Error(`r2 delete failed: ${res.status}`);
    },
    publicUrl: (key) => `${(c.publicBase ?? `${(c.fallbackBase ?? "").replace(/\/$/, "")}/api/v1/files`).replace(/\/$/, "")}/${assertKey(key)}`,
    async presignPut(key, o) {
      const signedHeaders = o.contentType ? { "content-type": o.contentType } : undefined;
      const url = await presignUrl({ ...base, method: "PUT", url: urlFor(key), expiresInS: o.expiresInS, signedHeaders });
      return { url, headers: o.contentType ? { "content-type": o.contentType } : undefined };
    },
  };
}
