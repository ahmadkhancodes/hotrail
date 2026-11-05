import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";

export interface ManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface Manifest {
  schema: 1;
  appId: string;
  version: string;
  headcode?: string;
  nativeFingerprint: string;
  files: ManifestFile[];
  createdAt: string;
}

export function normalizePath(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/^\.\//, "");
  if (n.startsWith("/") || n.split("/").some((s) => s === ".." || s === "")) {
    throw new Error(`unsafe path: ${p}`);
  }
  return n;
}

export async function buildManifest(input: {
  appId: string;
  version: string;
  headcode?: string;
  nativeFingerprint: string;
  files: { path: string; data: Uint8Array }[];
  createdAt?: string;
}): Promise<Manifest> {
  const files: ManifestFile[] = [];
  const seen = new Set<string>();
  for (const f of input.files) {
    const path = normalizePath(f.path);
    if (seen.has(path)) throw new Error(`duplicate path: ${path}`);
    seen.add(path);
    files.push({ path, sha256: await sha256Hex(f.data), size: f.data.byteLength });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    schema: 1,
    appId: input.appId,
    version: input.version,
    headcode: input.headcode,
    nativeFingerprint: input.nativeFingerprint,
    files,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export const manifestBytes = (m: Manifest): Uint8Array => new TextEncoder().encode(canonicalJson(m));

/** SHA-256 over the canonical manifest: the bundle's content identity. */
export const manifestDigest = (m: Manifest): Promise<string> => sha256Hex(manifestBytes(m));
