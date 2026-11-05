// Upload policy: web layer only. Native binaries and archive bombs are rejected.

export const NATIVE_EXTENSIONS = [".so", ".dex", ".jar", ".dylib", ".a", ".aar", ".apk", ".aab", ".ipa", ".o"];
export const NATIVE_DIR_SUFFIXES = [".framework", ".xcframework", ".app", ".bundle"];
export const POLICY_URL = "https://hotrail.buffersoltech.com/compliance#native-files";

export interface PolicyViolation {
  path: string;
  reason: string;
  policyUrl: string;
}

function magicIsNative(head: Uint8Array): string | null {
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0x7f && b(1) === 0x45 && b(2) === 0x4c && b(3) === 0x46) return "ELF binary";
  if (b(0) === 0x64 && b(1) === 0x65 && b(2) === 0x78 && b(3) === 0x0a) return "Dalvik executable (dex)";
  const m = ((b(0) << 24) | (b(1) << 16) | (b(2) << 8) | b(3)) >>> 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(m)) return "Mach-O binary";
  if (b(0) === 0x4d && b(1) === 0x5a) return "PE/Windows executable";
  return null;
}

/** head = first bytes of the file (16 is enough). Returns a violation or null. */
export function checkFile(path: string, head: Uint8Array): PolicyViolation | null {
  const lower = path.toLowerCase();
  const ext = NATIVE_EXTENSIONS.find((e) => lower.endsWith(e));
  if (ext) return { path, reason: `Native file type ${ext} is not allowed`, policyUrl: POLICY_URL };
  const seg = lower.split("/").find((s) => NATIVE_DIR_SUFFIXES.some((d) => s.endsWith(d)));
  if (seg) return { path, reason: `Native bundle directory ${seg} is not allowed`, policyUrl: POLICY_URL };
  const kind = magicIsNative(head);
  if (kind) return { path, reason: `File content is a ${kind}`, policyUrl: POLICY_URL };
  return null;
}

export interface ArchiveLimits {
  maxEntries: number;
  maxTotalUncompressed: number;
  maxRatio: number;
  maxSingleFile: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 20_000,
  maxTotalUncompressed: 500 * 1024 * 1024,
  maxRatio: 100,
  maxSingleFile: 100 * 1024 * 1024,
};

export function checkArchive(
  entries: { name: string; compressedSize: number; uncompressedSize: number }[],
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): string | null {
  if (entries.length > limits.maxEntries) return `Archive has ${entries.length} entries (limit ${limits.maxEntries})`;
  let total = 0;
  let comp = 0;
  for (const e of entries) {
    if (e.uncompressedSize > limits.maxSingleFile) return `${e.name} is larger than ${limits.maxSingleFile} bytes uncompressed`;
    total += e.uncompressedSize;
    comp += e.compressedSize;
  }
  if (total > limits.maxTotalUncompressed) return `Archive expands to ${total} bytes (limit ${limits.maxTotalUncompressed})`;
  if (comp > 0 && total / comp > limits.maxRatio) return `Archive compression ratio ${(total / comp).toFixed(0)}:1 exceeds ${limits.maxRatio}:1`;
  return null;
}
