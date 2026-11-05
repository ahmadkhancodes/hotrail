import { sha256Hex } from "@buffersol/hotrail-core";
import type { Clock, DeviceInfo, FetchLike, KVStorage, NativeBridge } from "../src/types";

const enc = new TextEncoder();

export class FakeNative implements NativeBridge {
  files = new Map<string, Uint8Array>();
  server = new Map<string, Uint8Array | Error>(); // url -> bytes
  zips = new Map<string, Record<string, string>>(); // zip url -> files inside
  zipContent = new Map<string, string>();
  active: string | null = null;
  trial: { previous: string | null; version: string } | null = null;
  reloads = 0;
  downloads: string[] = [];
  nativeRevert: string | null = null;
  failDownloadTimes = 0;
  device: DeviceInfo = {
    deviceId: "dev-1", platform: "android", versionBuild: "42", versionOs: "14", isEmulator: false, isProd: true,
    pluginVersion: "0.1.0", bundlesRoot: "/b", builtinDir: null,
  };
  async getDeviceInfo() { return this.device; }
  async download(url: string, dest: string) {
    this.downloads.push(url);
    if (this.failDownloadTimes > 0) { this.failDownloadTimes--; throw new Error("network"); }
    const s = this.server.get(url);
    if (!s || s instanceof Error) throw s ?? new Error("404");
    this.files.set(dest, s);
  }
  async unzip(zipPath: string, destDir: string) {
    const content = this.zipContent.get(zipPath);
    const url = [...this.zips.keys()].find((u) => u === content);
    if (!url) throw new Error("bad zip");
    for (const [p, c] of Object.entries(this.zips.get(url)!)) this.files.set(`${destDir}/${p}`, enc.encode(c));
  }
  async hashFile(p: string) { const d = this.files.get(p); return d ? sha256Hex(d) : null; }
  async copyFile(s: string, d: string) { this.files.set(d, this.files.get(s)!); }
  async removePath(p: string) { for (const k of [...this.files.keys()]) if (k === p || k.startsWith(p + "/")) this.files.delete(k); }
  async setBundle(path: string | null, o: { trial: boolean; previous: string | null; version: string }) {
    this.active = path; this.trial = o.trial ? { previous: o.previous, version: o.version } : null;
  }
  async reload() { this.reloads++; }
  async confirmBundle() { this.trial = null; }
  async consumeNativeRevert() { const v = this.nativeRevert; this.nativeRevert = null; return v; }
}

// A zip is registered as bytes whose content is the zip url, so unzip can find its file list.
export function addZip(n: FakeNative, url: string, files: Record<string, string>): Promise<string> {
  n.zips.set(url, files);
  const bytes = enc.encode(url);
  n.server.set(url, bytes);
  const orig = n.download.bind(n);
  n.download = async (u: string, d: string) => { await orig(u, d); if (u === url) n.zipContent.set(d, url); };
  return sha256Hex(bytes);
}

export class MemStorage implements KVStorage {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async set(k: string, v: string) { this.m.set(k, v); }
  async remove(k: string) { this.m.delete(k); }
}

export class FakeClock implements Clock {
  t = 1_000_000;
  sleeps: number[] = [];
  timers: { at: number; fn: () => void; live: boolean }[] = [];
  now() { return this.t; }
  async sleep(ms: number) { this.sleeps.push(ms); this.t += ms; }
  setTimer(ms: number, fn: () => void) {
    const x = { at: this.t + ms, fn, live: true };
    this.timers.push(x);
    return () => { x.live = false; };
  }
  advance(ms: number) {
    this.t += ms;
    for (const x of this.timers) if (x.live && x.at <= this.t) { x.live = false; x.fn(); }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Req { url: string; body: any }
export class FakeFetch {
  posts: Req[] = [];
  update: unknown = { message: "no_new_version_available" };
  updateStatus = 200;
  json = new Map<string, unknown>();
  throwAll = false;
  fn: FetchLike = async (url, init) => {
    if (this.throwAll) throw new Error("offline");
    if (init?.method === "POST") {
      const body = JSON.parse(init.body ?? "{}");
      this.posts.push({ url, body });
      if (url.includes("/update")) return { ok: this.updateStatus === 200, status: this.updateStatus, json: async () => this.update };
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const j = this.json.get(url);
    return { ok: j !== undefined, status: j !== undefined ? 200 : 404, json: async () => j };
  };
  beacons() { return this.posts.filter((p) => p.url.includes("/stats")).map((p) => p.body); }
  actions() { return this.beacons().map((b) => b.action); }
}

export const CFG = { appId: "com.acme.app", updateUrl: "https://api.test/update", statsUrl: "https://api.test/stats" };
