import type { HotrailUpdaterNative } from "./definitions";
import type { Clock, KVStorage, NativeBridge } from "./types";

export const nativeToBridge = (n: HotrailUpdaterNative): NativeBridge => ({
  getDeviceInfo: () => n.getDeviceInfo(),
  download: (url, dest) => n.download({ url, dest }),
  unzip: (src, dest) => n.unzip({ src, dest }),
  hashFile: async (path) => (await n.hashFile({ path })).sha256,
  copyFile: (src, dest) => n.copyFile({ src, dest }),
  ...(n.decryptFile ? { decryptFile: (path: string, key: string, iv: string) => n.decryptFile!({ path, key, iv }) } : {}),
  removePath: (path) => n.removePath({ path }),
  setBundle: (path, o) => n.setBundle({ path, ...o }),
  reload: () => n.reload(),
  confirmBundle: () => n.confirmBundle(),
  consumeNativeRevert: async () => (await n.consumeNativeRevert()).version,
});

export const nativeToStorage = (n: HotrailUpdaterNative): KVStorage => ({
  get: async (key) => (await n.storageGet({ key })).value,
  set: (key, value) => n.storageSet({ key, value }),
  remove: (key) => n.storageRemove({ key }),
});

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  setTimer: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
};
