// Encrypted bundles, TypeScript half. The server (or CLI) generates a random AES key and IV per bundle, encrypts the
// zip with AES-CBC (PKCS7), and sends `session_key = <iv base64>:<RSA-OAEP(SHA-256) wrapped AES key base64>` in the update
// response. The app embeds the matching RSA private key (PKCS#8, PEM or base64) in its config. This module unwraps the
// key with WebCrypto and can decrypt small buffers; large files are decrypted by the native bridge (`decryptFile`), which
// is NOT compiled or tested in this repo yet (see README, "What remains native only").
// `checksum` for an encrypted bundle is the SHA-256 of the DECRYPTED zip.

export class SessionKeyError extends Error {}

export interface SessionKey { key: Uint8Array; iv: Uint8Array }

const b64decode = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
export const b64encode = (b: Uint8Array): string => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };

/** Accepts a PEM block or bare base64 of PKCS#8 DER. */
export function privateKeyDer(input: string): Uint8Array {
  const body = input.replace(/-----(BEGIN|END)[A-Z ]*-----/g, "").replace(/\s+/g, "");
  if (!body) throw new SessionKeyError("empty private key");
  try { return b64decode(body); } catch { throw new SessionKeyError("private key is not base64"); }
}

export function parseSessionKey(sessionKey: string): { iv: Uint8Array; wrapped: Uint8Array } {
  const parts = sessionKey.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new SessionKeyError("malformed session_key");
  let iv: Uint8Array; let wrapped: Uint8Array;
  try { iv = b64decode(parts[0]); wrapped = b64decode(parts[1]); } catch { throw new SessionKeyError("session_key is not base64"); }
  if (iv.length !== 16) throw new SessionKeyError("session_key iv must be 16 bytes");
  if (wrapped.length < 128) throw new SessionKeyError("session_key wrapped key too short");
  return { iv, wrapped };
}

export async function unwrapSessionKey(sessionKey: string, privateKey: string): Promise<SessionKey> {
  const { iv, wrapped } = parseSessionKey(sessionKey);
  try {
    const k = await crypto.subtle.importKey("pkcs8", privateKeyDer(privateKey) as BufferSource, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, k, wrapped as BufferSource));
    if (raw.length !== 16 && raw.length !== 32) throw new SessionKeyError("unexpected AES key length");
    return { key: raw, iv };
  } catch (e) {
    if (e instanceof SessionKeyError) throw e;
    throw new SessionKeyError("could not unwrap session_key with the configured private key");
  }
}

/** AES-CBC/PKCS7 decrypt of an in-memory buffer (tests, small files, web fallback). */
export async function decryptBytes(data: Uint8Array, s: SessionKey): Promise<Uint8Array> {
  try {
    const k = await crypto.subtle.importKey("raw", s.key as BufferSource, { name: "AES-CBC" }, false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: s.iv as BufferSource }, k, data as BufferSource));
  } catch { throw new SessionKeyError("decryption failed"); }
}
