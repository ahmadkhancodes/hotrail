import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertKey, type BundleStore } from "./types";

/** Filesystem store for local dev (BUNDLE_STORE=fs, BUNDLE_STORE_DIR=.data/bundles). Node runtime only. */
export function createFsStore(dir: string, baseUrl = "http://localhost:3000"): BundleStore {
  const root = resolve(dir);
  const path = (key: string) => {
    const p = resolve(join(root, assertKey(key)));
    if (!p.startsWith(root + "/") && p !== root) throw new Error("path escape");
    return p;
  };
  return {
    kind: "fs",
    async put(key, data) {
      const p = path(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data);
    },
    async get(key) {
      const p = path(key);
      try { return new Uint8Array(await readFile(p)); } catch { return null; }
    },
    async has(key) {
      const p = path(key);
      try { return (await stat(p)).isFile(); } catch { return false; }
    },
    async delete(key) {
      await rm(path(key), { force: true });
    },
    publicUrl: (key) => `${baseUrl.replace(/\/$/, "")}/api/v1/files/${assertKey(key)}`,
    async presignPut() {
      return null;
    },
  };
}
