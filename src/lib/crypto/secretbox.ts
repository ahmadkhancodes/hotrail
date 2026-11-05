// Envelope-lite encryption for secrets at rest (per-app signing keys): AES-256-GCM with a key encryption key (KEK)
// from SECRETS_KEK (base64, 32 bytes). Dev and tests fall back to a key derived from BETTER_AUTH_SECRET.
// Format: "v1." + base64url(iv(12) || ciphertext+tag). The `aad` (e.g. the app id) binds a blob to its owner.

import { b64url, fromB64url } from "@/lib/ids";

const enc = new TextEncoder();

export async function kekFromEnv(e: Record<string, string | undefined> = process.env): Promise<CryptoKey> {
  let raw: Uint8Array;
  if (e.SECRETS_KEK) {
    raw = Uint8Array.from(atob(e.SECRETS_KEK), (c) => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error("SECRETS_KEK must be 32 bytes, base64");
  } else if (e.BETTER_AUTH_SECRET) {
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`hotrail-kek:${e.BETTER_AUTH_SECRET}`)));
  } else if (e.NODE_ENV !== "production") {
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("hotrail-dev-kek")));
  } else {
    throw new Error("SECRETS_KEK is not set");
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(plain: string, kek: CryptoKey, aad = ""): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, kek, enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1.${b64url(out)}`;
}

export async function open(sealed: string, kek: CryptoKey, aad = ""): Promise<string> {
  if (!sealed.startsWith("v1.")) throw new Error("unknown secret format");
  const all = fromB64url(sealed.slice(3));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: enc.encode(aad) }, kek, all.slice(12) as BufferSource);
  return new TextDecoder().decode(pt);
}
