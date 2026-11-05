import type { CheckResult, DeviceInfo, DownloadResult, HotrailConfig, UpdaterEvent, UpdaterState, BundleRef } from "./types";

/**
 * Raw native plugin surface. Implemented by Swift and Kotlin (and web.ts for tests and browsers).
 * `registerPlugin('HotrailUpdater')` returns this. App code normally uses the `HotrailUpdater` facade instead.
 */
export interface HotrailUpdaterNative {
  getDeviceInfo(): Promise<DeviceInfo>;
  download(opts: { url: string; dest: string }): Promise<void>;
  unzip(opts: { src: string; dest: string }): Promise<void>;
  hashFile(opts: { path: string }): Promise<{ sha256: string | null }>;
  copyFile(opts: { src: string; dest: string }): Promise<void>;
  removePath(opts: { path: string }): Promise<void>;
  /** setServerBasePath-style switch. path null = built-in bundle. */
  setBundle(opts: { path: string | null; trial: boolean; previous: string | null; version: string }): Promise<void>;
  reload(): Promise<void>;
  confirmBundle(): Promise<void>;
  consumeNativeRevert(): Promise<{ version: string | null }>;
  storageGet(opts: { key: string }): Promise<{ value: string | null }>;
  storageSet(opts: { key: string; value: string }): Promise<void>;
  storageRemove(opts: { key: string }): Promise<void>;
}

/** High level API for app code. */
export interface HotrailUpdaterApi {
  /** Configure and run launch handling (crash revert, pending apply). Call first, as early as possible. */
  configure(config: HotrailConfig): Promise<void>;
  /** Ask the server; never throws. */
  check(): Promise<CheckResult>;
  /** check + download + strategy. Never throws. */
  sync(): Promise<void>;
  download(update: NonNullable<CheckResult["update"]>): Promise<DownloadResult>;
  /** Apply the pending bundle now (the "set/next" operation) and reload. */
  apply(): Promise<boolean>;
  reload(): Promise<void>;
  /** Confirm the running bundle. Call when your UI is healthy, within appReadyTimeoutMs. */
  notifyAppReady(): Promise<{ version: string | null; confirmed: boolean }>;
  getCurrent(): { version: string; builtin: boolean; pending: string | null; trial: boolean };
  list(): BundleRef[];
  delete(version: string): Promise<boolean>;
  /** Back to the built-in bundle. */
  reset(): Promise<void>;
  getState(): UpdaterState;
  addListener(event: UpdaterEvent, fn: (payload: Record<string, unknown>) => void): () => void;
}
