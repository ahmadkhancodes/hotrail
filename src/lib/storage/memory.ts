import { assertKey, type BundleStore, type PutOptions } from "./types";

/** In-memory store for tests and stub mode. Counts bytes written so tests can assert delta sizes. */
export interface MemoryStore extends BundleStore {
  readonly kind: "memory";
  readonly objects: Map<string, { data: Uint8Array; opts: PutOptions }>;
  bytesWritten: number;
}

export function createMemoryStore(baseUrl = "http://localhost:3000"): MemoryStore {
  const objects = new Map<string, { data: Uint8Array; opts: PutOptions }>();
  const store: MemoryStore = {
    kind: "memory",
    objects,
    bytesWritten: 0,
    async put(key, data, opts = {}) {
      objects.set(assertKey(key), { data: data.slice(), opts });
      store.bytesWritten += data.byteLength;
    },
    async get(key) {
      const o = objects.get(assertKey(key));
      return o ? o.data.slice() : null;
    },
    async has(key) {
      return objects.has(assertKey(key));
    },
    async delete(key) {
      objects.delete(assertKey(key));
    },
    publicUrl: (key) => `${baseUrl.replace(/\/$/, "")}/api/v1/files/${assertKey(key)}`,
    async presignPut() {
      return null;
    },
  };
  return store;
}
