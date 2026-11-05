import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/storage/memory";
import { createFsStore } from "@/lib/storage/fs";
import { createR2Store } from "@/lib/storage/r2";
import { presignUrl, sha256Hex, signRequest } from "@/lib/storage/sigv4";
import { storeFromEnv } from "@/lib/storage";
import { kekFromEnv, open, seal } from "@/lib/crypto/secretbox";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SigV4 (WebCrypto)", () => {
  it("matches the AWS get-vanilla test vector", async () => {
    const h = await signRequest({
      method: "GET", url: "https://example.amazonaws.com/", payloadHash: await sha256Hex(""), region: "us-east-1", service: "service",
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" }, now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });
  it("presigned URLs carry the signature in the query and are deterministic", async () => {
    const args = { method: "PUT", url: "https://acct.r2.cloudflarestorage.com/bkt/blobs/a/b", region: "auto", service: "s3", expiresInS: 900, credentials: { accessKeyId: "AK", secretAccessKey: "SK" }, now: new Date("2026-11-05T12:00:00Z") };
    const a = await presignUrl(args);
    expect(a).toContain("X-Amz-Signature=");
    expect(a).toContain("X-Amz-Expires=900");
    expect(await presignUrl(args)).toBe(a);
    expect(await presignUrl({ ...args, credentials: { accessKeyId: "AK", secretAccessKey: "other" } })).not.toBe(a);
  });
});

describe("BundleStore implementations", () => {
  it("memory and fs behave the same", async () => {
    for (const store of [createMemoryStore("http://x"), createFsStore(mkdtempSync(join(tmpdir(), "hr-store-")), "http://x")]) {
      expect(await store.get("a/b.txt")).toBeNull();
      await store.put("a/b.txt", new Uint8Array([1, 2, 3]));
      expect(await store.has("a/b.txt")).toBe(true);
      expect(Array.from((await store.get("a/b.txt"))!)).toEqual([1, 2, 3]);
      await store.delete("a/b.txt");
      expect(await store.has("a/b.txt")).toBe(false);
      expect(store.publicUrl("zips/x.zip")).toBe("http://x/api/v1/files/zips/x.zip");
      await expect(store.put("../escape", new Uint8Array())).rejects.toThrow();
      await expect(store.get("/abs")).rejects.toThrow();
    }
  });
  it("R2 store signs path style S3 requests through fetch", async () => {
    const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
    const objects = new Map<string, Uint8Array>();
    const store = createR2Store({
      accountId: "acct", bucket: "hotrail-bundles", credentials: { accessKeyId: "AK", secretAccessKey: "SK" }, publicBase: "https://hotrail-cdn.buffersoltech.com",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, method: init.method!, headers: init.headers as Record<string, string> });
        const key = new URL(url).pathname;
        if (init.method === "PUT") { objects.set(key, init.body as Uint8Array); return new Response(null, { status: 200 }); }
        if (init.method === "DELETE") { objects.delete(key); return new Response(null, { status: 204 }); }
        const o = objects.get(key);
        return o ? new Response(init.method === "HEAD" ? null : (o as BodyInit), { status: 200 }) : new Response(null, { status: 404 });
      }) as typeof fetch,
    });
    await store.put("ptr/app/index.json", new Uint8Array([123, 125]), { contentType: "application/json", cacheControl: "public, max-age=5" });
    expect(seen[0]!.url).toBe("https://acct.r2.cloudflarestorage.com/hotrail-bundles/ptr/app/index.json");
    expect(seen[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(seen[0]!.headers["x-amz-content-sha256"]).toBe(await sha256Hex(new Uint8Array([123, 125])));
    expect(await store.has("ptr/app/index.json")).toBe(true);
    expect(Array.from((await store.get("ptr/app/index.json"))!)).toEqual([123, 125]);
    expect(await store.get("missing")).toBeNull();
    await store.delete("ptr/app/index.json");
    expect(await store.has("ptr/app/index.json")).toBe(false);
    expect(store.publicUrl("zips/a/b.zip")).toBe("https://hotrail-cdn.buffersoltech.com/zips/a/b.zip");
    const put = await store.presignPut("blobs/a/b", { expiresInS: 900 });
    expect(put!.url).toContain("X-Amz-Signature=");
  });
  it("selection by env: memory when R2 variables are absent, r2 when complete", async () => {
    expect((await storeFromEnv({})).kind).toBe("memory");
    expect((await storeFromEnv({ R2_ACCOUNT_ID: "a", R2_BUCKET: "b" })).kind).toBe("memory");
    expect((await storeFromEnv({ R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" })).kind).toBe("r2");
    expect((await storeFromEnv({ BUNDLE_STORE: "fs", BUNDLE_STORE_DIR: mkdtempSync(join(tmpdir(), "hr-")) })).kind).toBe("fs");
  });
});

describe("secretbox", () => {
  it("round trips and binds the ciphertext to its owner", async () => {
    const kek = await kekFromEnv({ NODE_ENV: "test", BETTER_AUTH_SECRET: "s".repeat(32) });
    const sealed = await seal("pkcs8-private-key", kek, "app-1");
    expect(sealed).not.toContain("pkcs8");
    expect(await open(sealed, kek, "app-1")).toBe("pkcs8-private-key");
    await expect(open(sealed, kek, "app-2")).rejects.toThrow();
    const other = await kekFromEnv({ NODE_ENV: "test", BETTER_AUTH_SECRET: "t".repeat(32) });
    await expect(open(sealed, other, "app-1")).rejects.toThrow();
  });
  it("refuses to run in production without a KEK", async () => {
    await expect(kekFromEnv({ NODE_ENV: "production" })).rejects.toThrow();
  });
});
