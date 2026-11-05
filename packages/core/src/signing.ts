import { fromBase64, toBase64 } from "./hash";
import { Manifest, manifestBytes } from "./manifest";

// Ed25519 through WebCrypto (Node 20+, Vercel Edge, Cloudflare Workers). Keys travel as base64 raw/pkcs8.

export interface KeyPairB64 {
  publicKey: string; // raw 32 bytes, base64
  privateKey: string; // pkcs8, base64 (customer keeps this)
}

export async function generateSigningKeyPair(): Promise<KeyPairB64> {
  const kp = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { publicKey: toBase64(pub), privateKey: toBase64(priv) };
}

export interface SignedManifest {
  manifest: Manifest;
  signature: string; // base64
  keyId: string; // first 16 hex chars of sha256(publicKey) is computed by caller; opaque here
}

export async function signManifest(m: Manifest, privateKeyB64: string, keyId = ""): Promise<SignedManifest> {
  const key = await crypto.subtle.importKey("pkcs8", fromBase64(privateKeyB64) as BufferSource, "Ed25519", false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", key, manifestBytes(m) as BufferSource));
  return { manifest: m, signature: toBase64(sig), keyId };
}

/** Returns false for any failure (bad key, bad signature, tampered manifest). Never throws. */
export async function verifyManifest(s: SignedManifest, publicKeyB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", fromBase64(publicKeyB64) as BufferSource, "Ed25519", false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, fromBase64(s.signature) as BufferSource, manifestBytes(s.manifest) as BufferSource);
  } catch {
    return false;
  }
}
