import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, createMongoStore, type ChunkDoc, type MongoLike, type ObjectDoc } from "@/lib/storage/mongo";
import { storeFromEnv } from "@/lib/storage";
import { harness, noise } from "./helpers/ship";
import { MAX_REQUEST_BYTES } from "@/lib/ship/types";

/** In-memory fake of the driver calls the store makes. `hook` lets a test interleave work between awaits. */
function fakeMongo(opts: { delay?: boolean } = {}) {
  const objects = new Map<string, ObjectDoc>();
  const chunks = new Map<string, ChunkDoc>();
  const tick = () => (opts.delay ? new Promise<void>((r) => setTimeout(r, Math.random() * 3)) : Promise.resolve());
  const m: MongoLike = {
    objects: {
      async findOne(f) { await tick(); const d = objects.get(f._id); return d ? { ...d } : null; },
      async findOneAndReplace(f, doc) { await tick(); const old = objects.get(f._id) ?? null; objects.set(f._id, { ...doc }); return old; },
      async findOneAndDelete(f) { await tick(); const old = objects.get(f._id) ?? null; objects.delete(f._id); return old; },
    },
    chunks: {
      async insertMany(docs) {
        await tick();
        for (const d of docs) {
          const k = `${d.key}|${d.n}`;
          if (chunks.has(k)) throw new Error("E11000 duplicate key");
          chunks.set(k, { ...d, data: d.data as Uint8Array });
        }
      },
      find(f) {
        return { sort: () => ({ toArray: async () => { await tick(); return [...chunks.values()].filter((c) => c.key === f.key).sort((a, b) => a.n - b.n); } }) };
      },
      async deleteMany(f) { await tick(); for (const [k, c] of chunks) if (c.key === f.key) chunks.delete(k); },
    },
  };
  return { m, objects, chunks };
}
const mk = (f = fakeMongo()) => ({ ...f, store: createMongoStore(async () => f.m, "https://x.test") });

describe("Mongo bundle store", () => {
  it("put/get/has/delete round trip with metadata", async () => {
    const { store, objects } = mk();
    expect(await store.get("a/b.bin")).toBeNull();
    expect(await store.has("a/b.bin")).toBe(false);
    await store.put("a/b.bin", new Uint8Array([1, 2, 3]), { contentType: "application/x" });
    expect(await store.has("a/b.bin")).toBe(true);
    expect(Array.from((await store.get("a/b.bin"))!)).toEqual([1, 2, 3]);
    const meta = objects.get("a/b.bin")!;
    expect(meta).toMatchObject({ size: 3, contentType: "application/x", chunks: 1 });
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    await store.delete("a/b.bin");
    expect(await store.has("a/b.bin")).toBe(false);
    expect(await store.get("a/b.bin")).toBeNull();
    await store.delete("a/b.bin"); // deleting a missing key is fine
  });

  it("handles empty objects and chunk boundaries", async () => {
    const { store, chunks, objects } = mk();
    for (const size of [0, 1, CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1, 2 * CHUNK_BYTES]) {
      const data = noise(size, size + 1);
      await store.put(`k/${size}`, data);
      expect(await store.get(`k/${size}`)).toEqual(data);
      expect(objects.get(`k/${size}`)!.chunks).toBe(Math.max(1, Math.ceil(size / CHUNK_BYTES)));
    }
    expect(chunks.size).toBe(1 + 1 + 1 + 1 + 2 + 2);
  });

  it("stores large objects in 2 MB chunks", { timeout: 30_000 }, async () => {
    const { store, chunks } = mk();
    const data = noise(9 * 1024 * 1024 + 17, 9);
    await store.put("blobs/big", data);
    expect(chunks.size).toBe(5);
    expect(await store.get("blobs/big")).toEqual(data);
  });

  it("replace swaps the object and leaves no old chunks", async () => {
    const { store, chunks } = mk();
    await store.put("p/x", noise(CHUNK_BYTES * 3, 1));
    expect(chunks.size).toBe(3);
    const next = noise(100, 2);
    await store.put("p/x", next);
    expect(await store.get("p/x")).toEqual(next);
    expect(chunks.size).toBe(1);
    await store.delete("p/x");
    expect(chunks.size).toBe(0);
  });

  it("a failed put keeps the old object and cleans up its partial chunks", async () => {
    const f = fakeMongo();
    const { store, chunks } = mk(f);
    await store.put("p/y", new Uint8Array([7]));
    const real = f.m.objects.findOneAndReplace;
    f.m.objects.findOneAndReplace = async () => { throw new Error("boom"); };
    await expect(store.put("p/y", noise(CHUNK_BYTES + 5))).rejects.toThrow("boom");
    f.m.objects.findOneAndReplace = real;
    expect(Array.from((await store.get("p/y"))!)).toEqual([7]);
    expect(chunks.size).toBe(1);
  });

  it("concurrent puts of the same key end with exactly one complete object and no orphan chunks", async () => {
    const f = fakeMongo({ delay: true });
    const { store, chunks } = mk(f);
    const versions = Array.from({ length: 6 }, (_, i) => noise(CHUNK_BYTES + 100 * (i + 1), i + 1));
    await Promise.all(versions.map((v) => store.put("c/same", v)));
    const got = (await store.get("c/same"))!;
    expect(versions.some((v) => v.byteLength === got.byteLength && v.every((b, i) => b === got[i]))).toBe(true);
    expect(chunks.size).toBe(2);
  });

  it("readers during a replace see a complete old or new object", async () => {
    const f = fakeMongo({ delay: true });
    const { store } = mk(f);
    const a = noise(CHUNK_BYTES + 1, 1), b = noise(CHUNK_BYTES * 2 + 1, 2);
    await store.put("r/k", a);
    const reads: Promise<Uint8Array | null>[] = [];
    const write = store.put("r/k", b);
    for (let i = 0; i < 10; i++) reads.push(store.get("r/k"));
    await write;
    for (const r of await Promise.all(reads)) expect([a.byteLength, b.byteLength]).toContain(r!.byteLength);
  });

  it("publicUrl uses the files route and presignPut is null; unsafe keys are refused", async () => {
    const { store } = mk();
    expect(store.publicUrl("blobs/a/b")).toBe("https://x.test/api/v1/files/blobs/a/b");
    expect(await store.presignPut("blobs/a", { expiresInS: 60 })).toBeNull();
    await expect(store.put("../x", new Uint8Array())).rejects.toThrow(/unsafe/);
  });
});

describe("store selection", () => {
  const R2 = { R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_ACCESS_KEY_ID: "c", R2_SECRET_ACCESS_KEY: "d" };
  const kind = async (e: Record<string, string>) => (await storeFromEnv(e, "https://x")).kind;
  it("explicit BUNDLE_STORE wins", async () => {
    expect(await kind({ BUNDLE_STORE: "mongo", MONGODB_URI: "mongodb://localhost:1/x" })).toBe("mongo");
    expect(await kind({ BUNDLE_STORE: "memory", MONGODB_URI: "mongodb://localhost:1/x", ...R2 })).toBe("memory");
    expect(await kind({ BUNDLE_STORE: "mongo", MONGODB_URI: "mongodb://localhost:1/x", ...R2 })).toBe("mongo");
    await expect(storeFromEnv({ BUNDLE_STORE: "mongo" }, "https://x")).rejects.toThrow(/MONGODB_URI/);
  });
  it("unset: R2 if complete, else mongo with a mongo driver, else memory", async () => {
    expect(await kind({ ...R2, MONGODB_URI: "mongodb://localhost:1/x" })).toBe("r2");
    expect(await kind({ ...R2 })).toBe("r2");
    expect(await kind({ MONGODB_URI: "mongodb://localhost:1/x" })).toBe("mongo");
    expect(await kind({ DB_DRIVER: "mongo", MONGODB_URI: "mongodb://localhost:1/x", R2_BUCKET: "b" })).toBe("mongo");
    expect(await kind({ DB_DRIVER: "memory", MONGODB_URI: "mongodb://localhost:1/x" })).toBe("memory");
    expect(await kind({})).toBe("memory");
  });
  it("production: mongo store allowed, memory next to a real database refused with both options in the text", async () => {
    expect(await kind({ NODE_ENV: "production", MONGODB_URI: "mongodb://localhost:1/x" })).toBe("mongo");
    expect(await kind({ NODE_ENV: "production", DB_DRIVER: "memory" })).toBe("memory");
    await expect(storeFromEnv({ NODE_ENV: "production", DB_DRIVER: "mongo" }, "https://x")).rejects.toThrow(/BUNDLE_STORE=mongo.*R2_ACCOUNT_ID/);
    await expect(storeFromEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://db", BUNDLE_STORE: "r2" }, "https://x")).rejects.toThrow(/bundle store not configured/);
  });
});

describe("request size limit (413)", () => {
  it("rejects a bundle zip above the limit with a clear JSON error", async () => {
    const h = harness();
    const res = await h.call("all", "POST", "bundles?appId=com.example.big&version=1.0.0", noise(MAX_REQUEST_BYTES + 1));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("request_too_large");
    expect(res.body.details.limit).toBe(MAX_REQUEST_BYTES);
    expect(res.body.hint).toMatch(/4\.5 MB.*R2/);
  });
  it("rejects an oversize blob PUT and an oversize file at plan time", async () => {
    const h = harness();
    const blob = await h.fetch(`${h.deps.baseUrl}/api/v1/upload/blob/${"a".repeat(64)}?app=x&size=1&exp=1&sig=x`, { method: "PUT", body: noise(MAX_REQUEST_BYTES + 1) as BodyInit });
    expect(blob.status).toBe(413);
    expect((await blob.json()).error).toBe("request_too_large");
    const data = noise(MAX_REQUEST_BYTES + 10);
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource)), (x) => x.toString(16).padStart(2, "0")).join("");
    const plan = await h.call("all", "POST", "upload/plan", {
      appId: "com.example.big", version: "1.0.0",
      manifest: { schema: 1, appId: "com.example.big", version: "1.0.0", nativeFingerprint: "fp", createdAt: "2026-11-05T12:00:00Z", files: [{ path: "big.bin", size: data.byteLength, sha256: sha }] },
    });
    expect(plan.body, JSON.stringify(plan.body)).toMatchObject({ error: "request_too_large" });
    expect(plan.status).toBe(413);
    expect(plan.body.hint).toMatch(/4\.5 MB/);
  });
  it("accepts a zip just under the limit", async () => {
    const h = harness();
    const res = await h.call("all", "POST", "bundles?appId=com.example.ok&version=1.0.0", new Uint8Array(1000));
    expect(res.status).not.toBe(413);
  });
});
