import { buildManifest, generateSigningKeyPair, sha256Hex, signManifest } from "@buffersol/hotrail-core";
import { beforeEach, describe, expect, it } from "vitest";
import { b64encode, decryptBytes, parseSessionKey, SessionKeyError, unwrapSessionKey } from "../src/session-key";
import { Updater } from "../src/updater";
import type { HotrailConfig } from "../src/types";
import { CFG, FakeClock, FakeFetch, FakeNative, MemStorage } from "./helpers";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function rsaPair() {
  const kp = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { pub: kp.publicKey, priv: b64encode(pkcs8), pem: `-----BEGIN PRIVATE KEY-----\n${b64encode(pkcs8)}\n-----END PRIVATE KEY-----` };
}

/** What the publisher does: encrypt plaintext with a fresh AES key, wrap the key for the app. */
async function seal(plain: Uint8Array, pub: CryptoKey, keyBytes = 32) {
  const key = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(keyBytes)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const k = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k, plain as BufferSource));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, key as BufferSource));
  return { cipher, sessionKey: `${b64encode(iv)}:${b64encode(wrapped)}` };
}

describe("session key", () => {
  it("unwraps and decrypts (PEM and base64 private key, AES-128 and AES-256)", async () => {
    const r = await rsaPair();
    for (const [priv, size] of [[r.priv, 32], [r.pem, 16]] as const) {
      const s = await seal(enc.encode("hello bundle"), r.pub, size);
      const sk = await unwrapSessionKey(s.sessionKey, priv);
      expect(sk.key.length).toBe(size);
      expect(dec.decode(await decryptBytes(s.cipher, sk))).toBe("hello bundle");
    }
  });
  it("rejects malformed keys and the wrong private key", async () => {
    const r = await rsaPair(); const other = await rsaPair();
    expect(() => parseSessionKey("nope")).toThrow(SessionKeyError);
    expect(() => parseSessionKey("AAAA:BBBB")).toThrow(SessionKeyError);
    const s = await seal(enc.encode("x"), r.pub);
    await expect(unwrapSessionKey(s.sessionKey, other.priv)).rejects.toThrow(SessionKeyError);
    await expect(unwrapSessionKey(s.sessionKey, "")).rejects.toThrow(SessionKeyError);
  });
  it("tampered ciphertext does not decrypt to the original", async () => {
    const r = await rsaPair();
    const s = await seal(enc.encode("hello bundle ".repeat(4)), r.pub);
    const sk = await unwrapSessionKey(s.sessionKey, r.priv);
    s.cipher[s.cipher.length - 1]! ^= 0xff;
    await expect(decryptBytes(s.cipher, sk)).rejects.toThrow(SessionKeyError);
  });
});

describe("updater with an encrypted bundle", () => {
  let n: FakeNative, f: FakeFetch, c: FakeClock, s: MemStorage;
  const mk = (cfg: Partial<HotrailConfig> = {}) => new Updater({ ...CFG, strategy: "immediate", ...cfg }, { bridge: n, fetch: f.fn, clock: c, storage: s });
  beforeEach(() => { n = new FakeNative(); f = new FakeFetch(); c = new FakeClock(); s = new MemStorage(); });

  const files = { "index.html": "<html>enc</html>" };
  async function offer(opts: { signedKey?: string; nativeDecrypt?: boolean } = {}) {
    const r = await rsaPair();
    const plainZipUrl = "plain-zip-marker";
    const plain = enc.encode(plainZipUrl);
    const sealed = await seal(plain, r.pub);
    n.zips.set(plainZipUrl, files);
    n.server.set("https://cdn.test/e.zip", sealed.cipher);
    // The fake bridge's download records the encrypted bytes; decryptFile swaps in the plaintext zip marker.
    if (opts.nativeDecrypt !== false) {
      n.decryptFile = async (path, keyB64, ivB64) => {
        const raw = (b: string) => Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0));
        const bytes = n.files.get(path)!;
        const out = await decryptBytes(bytes, { key: raw(keyB64), iv: raw(ivB64) });
        n.files.set(path, out);
        n.zipContent.set(path, dec.decode(out));
      };
    }
    f.update = { version: "3.0.0", url: "https://cdn.test/e.zip", checksum: await sha256Hex(plain), session_key: sealed.sessionKey };
    return r;
  }

  it("downloads, decrypts, verifies the checksum of the plaintext and applies", async () => {
    const r = await offer();
    const u = mk({ privateKey: r.priv }); await u.sync();
    expect(n.active).toBe("/b/3.0.0");
    expect(dec.decode(n.files.get("/b/3.0.0/index.html"))).toBe("<html>enc</html>");
  });
  it("refuses without a private key", async () => {
    await offer();
    const u = mk(); await u.sync();
    expect(n.active).toBeNull();
    expect(f.actions()).toContain("decrypt_fail");
  });
  it("refuses when the native bridge cannot decrypt", async () => {
    const r = await offer({ nativeDecrypt: false });
    const u = mk({ privateKey: r.priv }); await u.sync();
    expect(n.active).toBeNull();
    expect(f.actions()).toContain("decrypt_fail");
  });
  it("refuses a decrypted zip that does not match the checksum", async () => {
    const r = await offer();
    (f.update as { checksum: string }).checksum = "0".repeat(64);
    const u = mk({ privateKey: r.priv }); await u.sync();
    expect(n.active).toBeNull();
    expect(f.actions()).toContain("checksum_fail");
  });
  it("with a public key, verifies the signed manifest against the extracted files", async () => {
    const r = await offer();
    const kp = await generateSigningKeyPair();
    const m = await buildManifest({ appId: CFG.appId, version: "3.0.0", nativeFingerprint: "fp", files: [{ path: "index.html", data: enc.encode("<html>enc</html>") }], createdAt: "2026-01-01T00:00:00Z" });
    f.json.set("https://cdn.test/m/3.0.0.json", await signManifest(m, kp.privateKey));
    (f.update as Record<string, string>).manifest_url = "https://cdn.test/m/3.0.0.json";
    const u = mk({ privateKey: r.priv, publicKey: kp.publicKey }); await u.sync();
    expect(n.active).toBe("/b/3.0.0");
  });
});
