import { registerPlugin } from "@capacitor/core";
import { nativeToBridge, nativeToStorage, systemClock } from "./adapter";
import type { HotrailUpdaterApi, HotrailUpdaterNative } from "./definitions";
import type { FetchLike, HotrailConfig } from "./types";
import { Updater } from "./updater";

export * from "./types";
export * from "./definitions";
export { Updater } from "./updater";
export { nativeToBridge, nativeToStorage, systemClock } from "./adapter";

const native = registerPlugin<HotrailUpdaterNative>("HotrailUpdater", {
  web: () => import("./web").then((m) => new m.HotrailUpdaterWeb()),
});

let updater: Updater | null = null;
const need = (): Updater => {
  if (!updater) throw new Error("HotrailUpdater.configure() must be called first");
  return updater;
};
const noUpdater = { available: false } as const;

/** App facing API. check/sync never throw; they answer "no update" on any failure. */
export const HotrailUpdater: HotrailUpdaterApi = {
  async configure(config: HotrailConfig) {
    updater = new Updater(config, {
      bridge: nativeToBridge(native),
      storage: nativeToStorage(native),
      clock: systemClock,
      fetch: ((u, i) => fetch(u, i)) as FetchLike,
    });
    await updater.onLaunch();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void updater?.onBackground(); });
    }
  },
  check: async () => (updater ? updater.check() : noUpdater),
  sync: async () => { await updater?.sync(); },
  download: (u) => need().download(u),
  apply: () => need().apply(),
  reload: () => native.reload(),
  notifyAppReady: async () => (updater ? updater.notifyAppReady() : { version: null, confirmed: false }),
  getCurrent: () => need().getCurrent(),
  list: () => need().list(),
  delete: (v) => need().delete(v),
  reset: () => need().reset(),
  getState: () => (updater ? updater.state : "idle"),
  addListener: (ev, fn) => need().on(ev, fn),
};
