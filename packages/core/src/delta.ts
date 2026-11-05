import { ManifestFile } from "./manifest";

export interface UploadPlan {
  missing: ManifestFile[]; // blobs the server does not have yet
  reused: number; // count of files already stored
  totalBytes: number;
  uploadBytes: number;
  uploadRatio: number; // uploadBytes / totalBytes (0 when empty)
}

/** Content addressed delta: upload only blobs whose sha256 the server has not stored. */
export function planUpload(files: ManifestFile[], known: ReadonlySet<string>): UploadPlan {
  const seen = new Set<string>();
  const missing: ManifestFile[] = [];
  let totalBytes = 0;
  let uploadBytes = 0;
  for (const f of files) {
    totalBytes += f.size;
    if (known.has(f.sha256) || seen.has(f.sha256)) continue;
    seen.add(f.sha256);
    missing.push(f);
    uploadBytes += f.size;
  }
  return {
    missing,
    reused: files.length - missing.length,
    totalBytes,
    uploadBytes,
    uploadRatio: totalBytes === 0 ? 0 : uploadBytes / totalBytes,
  };
}
