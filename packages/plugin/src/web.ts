import { WebPlugin } from "@capacitor/core";
import { sha256Hex } from "@buffersol/hotrail-core";
import type { HotrailUpdaterNative } from "./definitions";
import type { DeviceInfo } from "./types";

/**
 * Web fallback: an in-memory file system, enough to exercise the full logic in a browser or in tests.
 * It cannot unzip (use signed manifests on web) and it does not really swap the page.
 */
export class HotrailUpdaterWeb extends WebPlugin implements HotrailUpdaterNative {
  private files = new Map<string, Uint8Array>();
  private kv = new Map<string, string>();
  private base: string | null = null;

  async getDeviceInfo(): Promise<DeviceInfo> {
    let id = this.kv.get("device_id");
    if (!id) { id = crypto.randomUUID(); this.kv.set("device_id", id); }
    return { deviceId: id, platform: "web", versionBuild: "0", versionOs: "web", isEmulator: false, isProd: true, pluginVersion: "0.1.0", bundlesRoot: "/hotrail/bundles", builtinDir: null };
  }
  async download(o: { url: string; dest: string }) {
    const r = await fetch(o.url);
    if (!r.ok) throw new Error(`http ${r.status}`);
    this.files.set(o.dest, new Uint8Array(await r.arrayBuffer()));
  }
  async unzip(): Promise<void> { throw new Error("unzip is not supported on web"); }
  async hashFile(o: { path: string }) {
    const d = this.files.get(o.path);
    return { sha256: d ? await sha256Hex(d) : null };
  }
  async copyFile(o: { src: string; dest: string }) {
    const d = this.files.get(o.src);
    if (!d) throw new Error("missing source");
    this.files.set(o.dest, d);
  }
  async removePath(o: { path: string }) {
    for (const k of [...this.files.keys()]) if (k === o.path || k.startsWith(o.path + "/")) this.files.delete(k);
  }
  async setBundle(o: { path: string | null }) { this.base = o.path; }
  async reload() { if (typeof location !== "undefined") location.reload(); }
  async confirmBundle() { /* nothing to persist on web */ }
  async consumeNativeRevert() { return { version: null }; }
  async storageGet(o: { key: string }) { return { value: this.kv.get("s:" + o.key) ?? null }; }
  async storageSet(o: { key: string; value: string }) { this.kv.set("s:" + o.key, o.value); }
  async storageRemove(o: { key: string }) { this.kv.delete("s:" + o.key); }
  get activeBase() { return this.base; }
}
