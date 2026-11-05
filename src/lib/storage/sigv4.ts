// AWS Signature Version 4 with WebCrypto only (no AWS SDK). Works on Node, Edge and Workers.

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(key: Uint8Array | string, msg: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

/** RFC 3986 encode (AWS flavour). Slashes are kept in paths. */
export function uriEncode(s: string, keepSlash = false): string {
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === "/")) out += ch;
    else for (const b of enc.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export interface Credentials { accessKeyId: string; secretAccessKey: string }

export const amzDate = (d: Date): string => d.toISOString().replace(/[:-]|\.\d{3}/g, "");

async function signingKey(secret: string, date: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmac("AWS4" + secret, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

interface SignInput {
  method: string;
  url: string;
  /** Headers to sign. `host` is added from the URL. Names are lowercased. */
  headers?: Record<string, string>;
  /** Hex sha256 of the body, or "UNSIGNED-PAYLOAD". */
  payloadHash: string;
  region: string;
  service: string;
  credentials: Credentials;
  now?: Date;
}

/** Header based signing. Returns the headers to send (including authorization and x-amz-date). */
export async function signRequest(i: SignInput): Promise<Record<string, string>> {
  const u = new URL(i.url);
  const now = i.now ?? new Date();
  const stamp = amzDate(now);
  const date = stamp.slice(0, 8);
  const headers: Record<string, string> = { host: u.host, "x-amz-date": stamp };
  for (const [k, v] of Object.entries(i.headers ?? {})) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonical = [i.method, uriEncode(decodeURIComponent(u.pathname), true), canonicalQuery(u.searchParams), canonicalHeaders, signedHeaders, i.payloadHash].join("\n");
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonical)].join("\n");
  const sig = hex(await hmac(await signingKey(i.credentials.secretAccessKey, date, i.region, i.service), toSign));
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${i.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return headers;
}

/** Query string presigning (for presigned PUT/GET URLs). */
export async function presignUrl(i: Omit<SignInput, "payloadHash" | "headers"> & { expiresInS: number; signedHeaders?: Record<string, string> }): Promise<string> {
  const u = new URL(i.url);
  const now = i.now ?? new Date();
  const stamp = amzDate(now);
  const date = stamp.slice(0, 8);
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const headers: Record<string, string> = { host: u.host };
  for (const [k, v] of Object.entries(i.signedHeaders ?? {})) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  u.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  u.searchParams.set("X-Amz-Credential", `${i.credentials.accessKeyId}/${scope}`);
  u.searchParams.set("X-Amz-Date", stamp);
  u.searchParams.set("X-Amz-Expires", String(i.expiresInS));
  u.searchParams.set("X-Amz-SignedHeaders", names.join(";"));
  const canonical = [
    i.method, uriEncode(decodeURIComponent(u.pathname), true), canonicalQuery(u.searchParams),
    names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonical)].join("\n");
  const sig = hex(await hmac(await signingKey(i.credentials.secretAccessKey, date, i.region, i.service), toSign));
  return `${u.origin}${u.pathname}?${canonicalQuery(u.searchParams)}&X-Amz-Signature=${sig}`;
}
