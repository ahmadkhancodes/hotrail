// Pure types shared by the updater core, the Capacitor facade and tests.

export type Strategy = "background" | "immediate" | "prompt";

export interface HotrailConfig {
  appId: string;
  updateUrl: string;
  statsUrl: string;
  channelUrl?: string;
  /** Ed25519 public key, raw 32 bytes, base64. When set, only signed manifests are installed. */
  publicKey?: string;
  /** RSA private key (PKCS#8, PEM or base64) that unwraps `session_key` for encrypted bundles. Without it an encrypted update is refused. */
  privateKey?: string;
  strategy?: Strategy; // default "background"
  appReadyTimeoutMs?: number; // default 10000
  maxRetries?: number; // default 3 (retries after the first attempt)
  retryBaseDelayMs?: number; // default 500, doubled per retry
}

export type UpdaterState = "idle" | "checking" | "downloading" | "verifying" | "ready" | "applied" | "confirmed" | "reverted";

export interface BundleRef {
  version: string;
  path: string;
}

export interface Trial extends BundleRef {
  previous: BundleRef | null; // null = built-in bundle
  boots: number; // launches observed for this trial
  deadline: number; // epoch ms, set at first launch
}

export interface PersistedState {
  current: BundleRef | null; // null = built-in bundle
  pending: BundleRef | null;
  trial: Trial | null;
  failed: string[];
  /** Transient integrity failures per version (checksum, unzip); blacklisted after MAX_TRANSIENT_FAILS. */
  attempts?: Record<string, number>;
  bundles: Record<string, BundleRef>;
  /** Store build (`versionBuild`) the downloaded bundles were installed under. A different build resets to built-in. */
  nativeBuild?: string;
}

export interface DeviceInfo {
  deviceId: string;
  platform: "ios" | "android" | "web";
  versionBuild: string;
  versionOs: string;
  isEmulator: boolean;
  isProd: boolean;
  pluginVersion: string;
  /** Absolute directory where downloaded bundles live (one folder per version). */
  bundlesRoot: string;
  /** Absolute path of the built-in web assets, or null if unreadable. Used as a delta source. */
  builtinDir: string | null;
}

/** What the native side must provide. All paths are absolute. File IO and hashing happen natively. */
export interface NativeBridge {
  getDeviceInfo(): Promise<DeviceInfo>;
  /** Stream a URL to a file. Rejects on non-2xx. */
  download(url: string, destPath: string): Promise<void>;
  /** Unzip with zip-slip protection; extracts atomically (temp dir then move). */
  unzip(zipPath: string, destDir: string): Promise<void>;
  /** SHA-256 hex of a file, or null if it does not exist. */
  hashFile(path: string): Promise<string | null>;
  copyFile(src: string, dest: string): Promise<void>;
  /** Decrypt a file in place with AES-CBC/PKCS7 (key and iv base64). Optional: a bridge without it cannot install encrypted bundles. */
  decryptFile?(path: string, keyBase64: string, ivBase64: string): Promise<void>;
  removePath(path: string): Promise<void>;
  /**
   * Switch the web root (setServerBasePath) and persist it as the active bundle. null = built-in.
   * With trial=true the native layer also persists a crash guard: if the app is cold started a second time
   * before confirmBundle(), it restores `previous` before any JS runs.
   */
  setBundle(path: string | null, opts: { trial: boolean; previous: string | null; version: string }): Promise<void>;
  reload(): Promise<void>;
  confirmBundle(): Promise<void>;
  /** Version that native crash guard reverted since last call, if any (clears the marker). */
  consumeNativeRevert(): Promise<string | null>;
}

export interface KVStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Returns a cancel function. */
  setTimer(ms: number, fn: () => void): () => void;
}

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface UpdateInfo {
  version: string;
  url: string;
  checksum: string;
  session_key?: string;
  manifest_url?: string;
  files_url?: string;
}

export interface CheckResult {
  available: boolean;
  update?: UpdateInfo;
  killed?: boolean;
}

export interface DownloadResult {
  ok: boolean;
  version?: string;
  error?: "download_fail" | "checksum_fail" | "signature_fail" | "unzip_fail" | "manifest_fail" | "decrypt_fail";
}

export type UpdaterEvent = "stateChanged" | "updateAvailable" | "updateReady" | "downloadFailed" | "applied" | "confirmed" | "reverted" | "killed";
export type Listener = (payload: Record<string, unknown>) => void;
