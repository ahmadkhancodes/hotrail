import { planUpload, verifyManifest, type SignedManifest } from "@buffersol/hotrail-core";
import { b64encode, SessionKeyError, unwrapSessionKey, type SessionKey } from "./session-key";
import type {
  BundleRef, CheckResult, Clock, DeviceInfo, DownloadResult, FetchLike, HotrailConfig, KVStorage, Listener, NativeBridge,
  PersistedState, UpdateInfo, UpdaterEvent, UpdaterState,
} from "./types";

const STATE_KEY = "hotrail.state.v1";

class IntegrityError extends Error {
  constructor(public code: NonNullable<DownloadResult["error"]>, msg: string) { super(msg); }
}

const safeName = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, "_");
const join = (a: string, b: string) => `${a.replace(/\/+$/, "")}/${b}`;
const empty = (): PersistedState => ({ current: null, pending: null, trial: null, failed: [], bundles: {} });

export interface UpdaterDeps {
  bridge: NativeBridge;
  fetch: FetchLike;
  clock: Clock;
  storage: KVStorage;
}

/** Pure TypeScript updater. All IO goes through the injected bridge, fetch, clock and storage. */
export class Updater {
  private cfg: Required<Pick<HotrailConfig, "strategy" | "appReadyTimeoutMs" | "maxRetries" | "retryBaseDelayMs">> & HotrailConfig;
  private st: PersistedState = empty();
  private _state: UpdaterState = "idle";
  private device: DeviceInfo | null = null;
  private listeners = new Map<UpdaterEvent, Set<Listener>>();
  private inflight = new Set<Promise<unknown>>();
  private cancelTimer: (() => void) | null = null;
  private loaded = false;

  constructor(config: HotrailConfig, private deps: UpdaterDeps) {
    this.cfg = { strategy: "background", appReadyTimeoutMs: 10000, maxRetries: 3, retryBaseDelayMs: 500, ...config };
  }

  get state(): UpdaterState { return this._state; }
  get strategy() { return this.cfg.strategy; }

  on(ev: UpdaterEvent, fn: Listener): () => void {
    const set = this.listeners.get(ev) ?? new Set();
    set.add(fn); this.listeners.set(ev, set);
    return () => set.delete(fn);
  }
  private emit(ev: UpdaterEvent, payload: Record<string, unknown> = {}) {
    for (const fn of this.listeners.get(ev) ?? []) { try { fn(payload); } catch { /* host listener errors never break us */ } }
  }
  private setState(s: UpdaterState) { this._state = s; this.emit("stateChanged", { state: s }); }

  // ---- persistence -------------------------------------------------------------------------------------------
  private async load() {
    this.loaded = true;
    try {
      const raw = await this.deps.storage.get(STATE_KEY);
      this.st = raw ? { ...empty(), ...(JSON.parse(raw) as PersistedState) } : empty();
    } catch { this.st = empty(); }
  }
  private save() { return this.deps.storage.set(STATE_KEY, JSON.stringify(this.st)); }
  private async info(): Promise<DeviceInfo> { return (this.device ??= await this.deps.bridge.getDeviceInfo()); }

  // ---- beacons (fire and forget) -----------------------------------------------------------------------------
  private beacon(action: string, version: string) {
    const p = (async () => {
      try {
        const d = await this.info();
        await this.deps.fetch(this.cfg.statsUrl, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, app_id: this.cfg.appId, device_id: d.deviceId, version_name: version, version_build: d.versionBuild, platform: d.platform }),
        });
      } catch { /* never throw */ }
    })();
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
  }
  /** Await outstanding beacons (tests, or before the app is suspended). */
  async flush() { await Promise.allSettled([...this.inflight]); }

  // ---- launch ------------------------------------------------------------------------------------------------
  /** Call once per JS launch, as early as possible. Handles crash revert and applies a pending background update. */
  async onLaunch(): Promise<void> {
    try {
      await this.load();
      if (await this.resetOnNativeChange()) return;
      const nativeReverted = await this.deps.bridge.consumeNativeRevert().catch(() => null);
      if (nativeReverted && this.st.trial) {
        const t = this.st.trial;
        this.st.current = t.previous; this.st.trial = null;
        this.markFailed(t.version); await this.save();
        this.beacon("rollback", t.version); this.setState("reverted"); this.emit("reverted", { version: t.version, reason: "native_crash_guard" });
        return;
      }
      const t = this.st.trial;
      if (t) {
        if (t.boots >= 1) { await this.revertTrial("unconfirmed_relaunch", false); return; }
        t.boots = 1; t.deadline = this.deps.clock.now() + this.cfg.appReadyTimeoutMs;
        await this.save();
        this.setState("applied");
        this.cancelTimer = this.deps.clock.setTimer(this.cfg.appReadyTimeoutMs, () => { void this.revertTrial("timeout", true); });
        return;
      }
      if (this.st.pending) await this.apply();
    } catch { /* never throw into the host */ }
  }

  /**
   * A store update replaced the native layer: bundles downloaded under the old build were made for the old native code
   * (plugins, Capacitor version), so keep none of them and go back to the built-in web assets of the new build.
   * Returns true when it reset (and reloaded).
   */
  private async resetOnNativeChange(): Promise<boolean> {
    const build = (await this.info()).versionBuild;
    const was = this.st.nativeBuild;
    if (was === build) return false;
    if (was === undefined) { this.st.nativeBuild = build; await this.save(); return false; }
    const active = this.st.trial?.version ?? this.st.current?.version ?? null;
    this.cancelTimer?.(); this.cancelTimer = null;
    for (const ref of Object.values(this.st.bundles)) await this.deps.bridge.removePath(ref.path).catch(() => {});
    this.st = { ...empty(), nativeBuild: build };
    await this.save();
    if (!active) return false;
    await this.deps.bridge.setBundle(null, { trial: false, previous: null, version: "builtin" });
    // Not a failure: `classifyAction` maps this to "other", so it never counts toward auto-pause.
    this.beacon("reset_native_change", active);
    this.setState("reverted"); this.emit("reverted", { version: active, reason: "native_build_changed" });
    await this.deps.bridge.reload();
    return true;
  }

  /** Host calls this when the app goes to background: background strategy applies the pending bundle now. */
  async onBackground(): Promise<void> {
    if (this.cfg.strategy === "background" && this.st.pending && !this.st.trial) await this.apply();
  }

  // ---- check -------------------------------------------------------------------------------------------------
  async check(): Promise<CheckResult> {
    try {
      if (!this.loaded) await this.load();
      this.setState("checking");
      const d = await this.info();
      const res = await this.deps.fetch(this.cfg.updateUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: d.platform, app_id: this.cfg.appId, device_id: d.deviceId, version_name: this.st.current?.version ?? "builtin",
          version_build: d.versionBuild, version_os: d.versionOs, plugin_version: d.pluginVersion, custom_id: "",
          is_prod: d.isProd, is_emulator: d.isEmulator,
        }),
      });
      if (!res.ok) return this.none();
      const body = (await res.json()) as Record<string, unknown>;
      if (body && body.kill_switch === true) return await this.handleKill();
      if (!body || typeof body.version !== "string" || typeof body.url !== "string" || typeof body.checksum !== "string") return this.none();
      const u = body as unknown as UpdateInfo;
      if (this.st.failed.includes(u.version)) return this.none();
      if (u.version === (this.st.current?.version ?? "builtin")) return this.none();
      this.setState(this.st.pending?.version === u.version ? "ready" : "idle");
      return { available: true, update: u };
    } catch { return this.none(); }
  }
  private none(): CheckResult { if (this._state === "checking") this.setState("idle"); return { available: false }; }

  /** Kill switch: go back to the built-in bundle, download nothing. */
  private async handleKill(): Promise<CheckResult> {
    const was = this.st.current;
    this.st.pending = null;
    if (was || this.st.trial) {
      const v = was?.version ?? this.st.trial?.version ?? "builtin";
      this.cancelTimer?.(); this.st.current = null; this.st.trial = null;
      await this.save();
      await this.deps.bridge.setBundle(null, { trial: false, previous: null, version: "builtin" });
      this.beacon("revert", v);
      this.setState("reverted"); this.emit("killed", { version: v });
      await this.deps.bridge.reload();
    } else this.setState("idle");
    return { available: false, killed: true };
  }

  // ---- sync (check + strategy) -------------------------------------------------------------------------------
  async sync(): Promise<void> {
    try {
      const c = await this.check();
      if (!c.available || !c.update) return;
      if (this.cfg.strategy === "prompt") this.emit("updateAvailable", { version: c.update.version });
      const r = this.st.pending?.version === c.update.version ? { ok: true } : await this.download(c.update);
      if (!r.ok) return;
      if (this.cfg.strategy === "immediate") await this.apply();
      else if (this.cfg.strategy === "prompt") this.emit("updateReady", { version: c.update.version });
    } catch { /* never throw */ }
  }

  // ---- download ----------------------------------------------------------------------------------------------
  async download(u: UpdateInfo): Promise<DownloadResult> {
    const bridge = this.deps.bridge;
    let dir = "";
    try {
      const d = await this.info();
      dir = join(d.bundlesRoot, safeName(u.version));
      this.setState("downloading");
      await bridge.removePath(dir);
      if (u.session_key) await this.downloadEncryptedBundle(u, dir);
      else if (u.manifest_url || this.cfg.publicKey) await this.downloadManifestBundle(u, dir, d);
      else await this.downloadZipBundle(u, dir);
      const ref: BundleRef = { version: u.version, path: dir };
      this.st.bundles[u.version] = ref; this.st.pending = ref;
      await this.save();
      this.beacon("download_complete", u.version);
      this.setState("ready");
      return { ok: true, version: u.version };
    } catch (e) {
      try { if (dir) await bridge.removePath(dir); } catch { /* ignore */ }
      const code = e instanceof IntegrityError ? e.code : "download_fail";
      if (e instanceof IntegrityError) { this.markFailed(u.version); await this.save().catch(() => {}); }
      this.beacon(code, u.version);
      this.emit("downloadFailed", { version: u.version, error: code });
      this.setState("idle");
      return { ok: false, version: u.version, error: code };
    }
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i <= this.cfg.maxRetries; i++) {
      try { return await fn(); } catch (e) {
        if (e instanceof IntegrityError) throw e;
        last = e;
        if (i < this.cfg.maxRetries) await this.deps.clock.sleep(this.cfg.retryBaseDelayMs * 2 ** i);
      }
    }
    throw last;
  }

  private async downloadZipBundle(u: UpdateInfo, dir: string): Promise<void> {
    const b = this.deps.bridge;
    const zip = `${dir}.zip`;
    try {
      await this.retry(() => b.download(u.url, zip));
      const h = await b.hashFile(zip);
      this.setState("verifying");
      if (!h || h.toLowerCase() !== u.checksum.toLowerCase()) throw new IntegrityError("checksum_fail", "zip checksum mismatch");
      try { await b.unzip(zip, dir); } catch { throw new IntegrityError("unzip_fail", "unzip failed"); }
    } finally { await b.removePath(zip).catch(() => {}); }
  }

  /** Fetch the manifest, verify the signature when a public key is configured, and check it matches the update. */
  private async loadManifest(u: UpdateInfo): Promise<SignedManifest> {
    if (!u.manifest_url) throw new IntegrityError("signature_fail", "signed bundle required but no manifest offered");
    const signed = await this.retry(async () => {
      const r = await this.deps.fetch(u.manifest_url!);
      if (!r.ok) throw new Error(`manifest http ${r.status}`);
      return (await r.json()) as SignedManifest;
    });
    this.setState("verifying");
    if (!signed || !signed.manifest || !Array.isArray(signed.manifest.files)) throw new IntegrityError("manifest_fail", "malformed manifest");
    if (this.cfg.publicKey && !(await verifyManifest(signed, this.cfg.publicKey))) throw new IntegrityError("signature_fail", "manifest signature invalid");
    const m = signed.manifest;
    if (m.appId !== this.cfg.appId || m.version !== u.version) throw new IntegrityError("manifest_fail", "manifest does not match update");
    for (const f of m.files) if (f.path.startsWith("/") || f.path.split("/").some((s) => s === ".." || s === "")) throw new IntegrityError("manifest_fail", "unsafe path");
    return signed;
  }

  /**
   * Encrypted bundle (`session_key` present): the full zip is downloaded, decrypted natively, then verified. Delta is not
   * used for encrypted bundles. With a public key the signed manifest is fetched and every extracted file is checked
   * against it; without one the decrypted zip must match `checksum`.
   */
  private async downloadEncryptedBundle(u: UpdateInfo, dir: string): Promise<void> {
    const b = this.deps.bridge;
    if (!this.cfg.privateKey) throw new IntegrityError("decrypt_fail", "encrypted bundle but no privateKey configured");
    if (!b.decryptFile) throw new IntegrityError("decrypt_fail", "native bridge cannot decrypt files");
    let sk: SessionKey;
    try { sk = await unwrapSessionKey(u.session_key!, this.cfg.privateKey); }
    catch (e) { throw new IntegrityError("decrypt_fail", e instanceof SessionKeyError ? e.message : "session key error"); }
    const signed = this.cfg.publicKey ? await this.loadManifest(u) : null;
    const zip = `${dir}.zip`;
    try {
      await this.retry(() => b.download(u.url, zip));
      try { await b.decryptFile(zip, b64encode(sk.key), b64encode(sk.iv)); } catch { throw new IntegrityError("decrypt_fail", "decryption failed"); }
      this.setState("verifying");
      const h = await b.hashFile(zip);
      if (!h || h.toLowerCase() !== u.checksum.toLowerCase()) throw new IntegrityError("checksum_fail", "decrypted zip checksum mismatch");
      try { await b.unzip(zip, dir); } catch { throw new IntegrityError("unzip_fail", "unzip failed"); }
      for (const f of signed?.manifest.files ?? []) {
        if ((await b.hashFile(join(dir, f.path))) !== f.sha256) throw new IntegrityError("checksum_fail", `file hash mismatch: ${f.path}`);
      }
    } finally { await b.removePath(zip).catch(() => {}); }
  }

  private async downloadManifestBundle(u: UpdateInfo, dir: string, d: DeviceInfo): Promise<void> {
    const b = this.deps.bridge;
    const signed = await this.loadManifest(u);
    const m = signed.manifest;

    // Delta: find which files are already on the device (current bundle first, then built-in), verify by hash.
    const sources = [this.st.current?.path, d.builtinDir].filter((x): x is string => !!x);
    const local = new Map<string, string>(); // sha256 -> source path
    for (const f of m.files) {
      if (local.has(f.sha256)) continue;
      for (const s of sources) {
        const p = join(s, f.path);
        if ((await b.hashFile(p)) === f.sha256) { local.set(f.sha256, p); break; }
      }
    }
    const plan = planUpload(m.files, new Set(local.keys()));
    const filesBase = u.files_url ?? new URL("/f/", u.manifest_url).toString();
    const placed = new Map<string, string>(); // sha256 -> path inside new bundle
    for (const f of plan.missing) {
      const dest = join(dir, f.path);
      await this.retry(() => b.download(`${filesBase.replace(/\/+$/, "")}/${f.sha256}`, dest));
      if ((await b.hashFile(dest)) !== f.sha256) throw new IntegrityError("checksum_fail", `file hash mismatch: ${f.path}`);
      placed.set(f.sha256, dest);
    }
    for (const f of m.files) {
      const dest = join(dir, f.path);
      if (placed.get(f.sha256) === dest) continue;
      const src = local.get(f.sha256) ?? placed.get(f.sha256);
      if (!src) throw new IntegrityError("manifest_fail", "no source for file");
      await b.copyFile(src, dest);
      if ((await b.hashFile(dest)) !== f.sha256) throw new IntegrityError("checksum_fail", `file hash mismatch: ${f.path}`);
    }
  }

  // ---- apply / trial / confirm / revert ----------------------------------------------------------------------
  /** Switch to the pending bundle as a trial and reload. Also the "next/set" operation. */
  async apply(): Promise<boolean> {
    const p = this.st.pending;
    if (!p) return false;
    const prev = this.st.current;
    this.st.trial = { ...p, previous: prev, boots: 0, deadline: this.deps.clock.now() + this.cfg.appReadyTimeoutMs };
    this.st.current = p; this.st.pending = null;
    await this.save();
    await this.deps.bridge.setBundle(p.path, { trial: true, previous: prev?.path ?? null, version: p.version });
    this.beacon("set", p.version);
    this.setState("applied"); this.emit("applied", { version: p.version });
    await this.deps.bridge.reload();
    return true;
  }

  /** The app calls this once its UI is healthy. Confirms the trial bundle. */
  async notifyAppReady(): Promise<{ version: string | null; confirmed: boolean }> {
    try {
      if (!this.loaded) await this.load();
      const t = this.st.trial;
      if (!t) return { version: this.st.current?.version ?? null, confirmed: false };
      this.cancelTimer?.(); this.cancelTimer = null;
      this.st.trial = null;
      await this.save();
      await this.deps.bridge.confirmBundle();
      this.setState("confirmed"); this.emit("confirmed", { version: t.version });
      await this.cleanup();
      return { version: t.version, confirmed: true };
    } catch { return { version: null, confirmed: false }; }
  }

  private markFailed(v: string) { if (!this.st.failed.includes(v)) this.st.failed.push(v); }

  private async revertTrial(reason: string, reload: boolean) {
    const t = this.st.trial;
    if (!t) return;
    this.cancelTimer?.(); this.cancelTimer = null;
    this.st.current = t.previous; this.st.trial = null; this.markFailed(t.version);
    delete this.st.bundles[t.version];
    await this.save();
    await this.deps.bridge.setBundle(t.previous?.path ?? null, { trial: false, previous: null, version: t.previous?.version ?? "builtin" });
    await this.deps.bridge.removePath(t.path).catch(() => {});
    this.beacon("rollback", t.version);
    this.setState("reverted"); this.emit("reverted", { version: t.version, reason });
    if (reload) await this.deps.bridge.reload();
  }

  private async cleanup() {
    const keep = new Set([this.st.current?.version, this.st.pending?.version]);
    for (const [v, ref] of Object.entries(this.st.bundles)) {
      if (keep.has(v)) continue;
      await this.deps.bridge.removePath(ref.path).catch(() => {});
      delete this.st.bundles[v];
    }
    await this.save();
  }

  // ---- inspection --------------------------------------------------------------------------------------------
  getCurrent(): { version: string; builtin: boolean; pending: string | null; trial: boolean } {
    return { version: this.st.current?.version ?? "builtin", builtin: !this.st.current, pending: this.st.pending?.version ?? null, trial: !!this.st.trial };
  }
  list(): BundleRef[] { return Object.values(this.st.bundles); }
  async delete(version: string): Promise<boolean> {
    if (this.st.current?.version === version || this.st.pending?.version === version) return false;
    const ref = this.st.bundles[version];
    if (!ref) return false;
    await this.deps.bridge.removePath(ref.path); delete this.st.bundles[version]; await this.save();
    return true;
  }
  /** Back to the built-in bundle. */
  async reset(reload = true): Promise<void> {
    this.cancelTimer?.();
    this.st.current = null; this.st.pending = null; this.st.trial = null;
    await this.save();
    await this.deps.bridge.setBundle(null, { trial: false, previous: null, version: "builtin" });
    this.setState("idle");
    if (reload) await this.deps.bridge.reload();
  }
  /** Test helper: force-load persisted state. */
  async init() { await this.load(); }
}
