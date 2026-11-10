import { assertKey, type BundleStore, type PutOptions } from "./types";

/**
 * MongoDB bundle store for the lean launch (no R2 yet). Objects are split into GridFS-style chunks.
 *  - `bundle_objects`: one metadata doc per key ({_id: key, v, size, chunks, contentType, sha256, ...}).
 *  - `bundle_chunks`: {key: "<key>#<v>", n, data}, unique on {key, n}. The version `v` is part of the chunk key so a
 *    replace writes a complete new chunk set first, flips the metadata doc, and only then deletes the old set.
 * Readers always follow the metadata doc, so they see the old or the new object, never a mix.
 */
export const CHUNK_BYTES = 2 * 1024 * 1024;
export const OBJECTS_COLLECTION = "bundle_objects";
export const CHUNKS_COLLECTION = "bundle_chunks";

export interface ObjectDoc {
  _id: string;
  v: string;
  size: number;
  chunks: number;
  contentType?: string;
  cacheControl?: string;
  sha256: string;
  updatedAt: Date;
}
export interface ChunkDoc { key: string; n: number; data: Uint8Array | { buffer: Uint8Array } }

/** The slice of the MongoDB driver the store uses (the tests supply a fake). */
export interface MongoLike {
  objects: {
    findOne(f: { _id: string }): Promise<ObjectDoc | null>;
    findOneAndReplace(f: { _id: string }, doc: ObjectDoc, o: { upsert: true; returnDocument: "before" }): Promise<ObjectDoc | null>;
    findOneAndDelete(f: { _id: string }): Promise<ObjectDoc | null>;
  };
  chunks: {
    insertMany(docs: ChunkDoc[]): Promise<unknown>;
    find(f: { key: string }): { sort(s: { n: 1 }): { toArray(): Promise<ChunkDoc[]> } };
    deleteMany(f: { key: string }): Promise<unknown>;
  };
}

export interface MongoStore extends BundleStore { readonly kind: "mongo" }

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", b as BufferSource);
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

const chunkKey = (key: string, v: string) => `${key}#${v}`;
const toBytes = (d: ChunkDoc["data"]): Uint8Array => (d instanceof Uint8Array ? d : (d as { buffer: Uint8Array }).buffer);

export function createMongoStore(open: () => Promise<MongoLike>, baseUrl = "http://localhost:3000"): MongoStore {
  async function dropChunks(m: MongoLike, key: string, v: string) {
    await m.chunks.deleteMany({ key: chunkKey(key, v) });
  }
  return {
    kind: "mongo",
    async put(key, data, opts: PutOptions = {}) {
      assertKey(key);
      const m = await open();
      const v = `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "")}`;
      const ck = chunkKey(key, v);
      const n = Math.max(1, Math.ceil(data.byteLength / CHUNK_BYTES));
      try {
        for (let i = 0; i < n; i += 1) {
          // one chunk per round trip keeps each write well under the 16 MB document and 48 MB message limits
          await m.chunks.insertMany([{ key: ck, n: i, data: data.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) }]);
        }
        const doc: ObjectDoc = {
          _id: key, v, size: data.byteLength, chunks: n, sha256: await sha256Hex(data), updatedAt: new Date(),
          ...(opts.contentType ? { contentType: opts.contentType } : {}), ...(opts.cacheControl ? { cacheControl: opts.cacheControl } : {}),
        };
        const old = await m.objects.findOneAndReplace({ _id: key }, doc, { upsert: true, returnDocument: "before" });
        if (old && old.v !== v) await dropChunks(m, key, old.v);
      } catch (e) {
        await dropChunks(m, key, v).catch(() => undefined);
        throw e;
      }
    },
    async get(key) {
      assertKey(key);
      const m = await open();
      // A concurrent replace can delete the chunk set between reading the doc and the chunks: re-read the doc.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const doc = await m.objects.findOne({ _id: key });
        if (!doc) return null;
        const rows = await m.chunks.find({ key: chunkKey(key, doc.v) }).sort({ n: 1 }).toArray();
        if (rows.length !== doc.chunks || rows.some((r, i) => r.n !== i)) continue;
        const out = new Uint8Array(doc.size);
        let at = 0;
        for (const r of rows) {
          const b = toBytes(r.data);
          out.set(b, at);
          at += b.byteLength;
        }
        if (at !== doc.size) continue;
        return out;
      }
      throw new Error(`bundle object ${key} is incomplete`);
    },
    async has(key) {
      return (await (await open()).objects.findOne({ _id: assertKey(key) })) !== null;
    },
    async delete(key) {
      const m = await open();
      const old = await m.objects.findOneAndDelete({ _id: assertKey(key) });
      if (old) await dropChunks(m, key, old.v);
    },
    publicUrl: (key) => `${baseUrl.replace(/\/$/, "")}/api/v1/files/${assertKey(key)}`,
    async presignPut() {
      return null;
    },
  };
}

/** Binds the store to the real driver (lazy: nothing connects until the first call). */
export async function createMongoStoreFromUri(uri: string, dbName: string, baseUrl: string): Promise<MongoStore> {
  const { mongoClient } = await import("@/lib/db/mongo");
  let p: Promise<MongoLike> | null = null;
  const open = () =>
    (p ??= mongoClient(uri).then((c) => {
      const d = c.db(dbName);
      return { objects: d.collection(OBJECTS_COLLECTION), chunks: d.collection(CHUNKS_COLLECTION) } as unknown as MongoLike;
    }));
  return createMongoStore(open, baseUrl);
}
