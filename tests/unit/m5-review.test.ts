import { describe, expect, it } from "vitest";
import { NO_UPDATE } from "@buffersol/hotrail-core";
import { checkUpdate } from "@/lib/hotpath/check";
import { storePointerReader, selfAssignChannel, clearDeviceChannel } from "@/lib/ship/device";
import { publishPointers, retireAppPointers } from "@/lib/ship/pointers";
import { listZip, writeZip } from "@/lib/ship/zip";
import { storeFromEnv } from "@/lib/storage";
import { probeDb } from "@/lib/health";
import { can } from "@/lib/auth/roles";
import { harness, ORG_A } from "./helpers/ship";

// M5 pre-launch review: one test per P0 (docs/REVIEW.md). Each failed before its fix.

const APP = "com.example.ordering";
const text = (s: string) => new TextEncoder().encode(s);
const zipOf = (files: Record<string, string | Uint8Array>) => writeZip(Object.entries(files).map(([path, d]) => ({ path, data: typeof d === "string" ? text(d) : d })));
const upload = (h: ReturnType<typeof harness>, key: string, version: string, zip: Uint8Array, app = APP) =>
  h.call(key, "POST", `bundles?appId=${app}&version=${version}`, zip);

/** A zip whose central directory lists only index.html, with an ELF `lib/evil.so` hidden in front as a local entry. */
function smuggledZip(): Uint8Array {
  const elf = new Uint8Array(64); elf.set([0x7f, 0x45, 0x4c, 0x46]);
  const hidden = writeZip([{ path: "lib/evil.so", data: elf }]);
  const hiddenLocal = hidden.subarray(0, new DataView(hidden.buffer, hidden.byteOffset).getUint32(hidden.length - 22 + 16, true));
  const visible = zipOf({ "index.html": "<html>ok</html>" });
  const out = new Uint8Array(hiddenLocal.length + visible.length);
  out.set(hiddenLocal); out.set(visible, hiddenLocal.length);
  const v = new DataView(out.buffer);
  const eocd = out.length - 22;
  const cd = v.getUint32(eocd + 16, true) + hiddenLocal.length;
  v.setUint32(eocd + 16, cd, true);
  v.setUint32(cd + 42, v.getUint32(cd + 42, true) + hiddenLocal.length, true);
  return out;
}

describe("P0-1 zip upload: devices get the inspected files only", () => {
  it("entries hidden from the central directory never reach the stored zip", async () => {
    const h = harness();
    const zip = smuggledZip();
    expect(listZip(zip).map((e) => e.name)).toEqual(["index.html"]); // the server only sees index.html
    const r = await upload(h, "all", "1.0.0", zip);
    expect(r.status).toBe(201);
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const bundle = (await h.deps.db.getBundleByHeadcode(app.id, r.body.headcode))!;
    const stored = (await h.deps.store.get(bundle.zipKey))!;
    expect(new TextDecoder("latin1").decode(stored)).not.toContain("evil.so");
    expect(listZip(stored).map((e) => e.name)).toEqual(["index.html"]);
  });
});

describe("P0-2 app id takeover after an org is deleted", () => {
  it("retired pointers stop updates and another org cannot claim the app id", async () => {
    const h = harness();
    expect((await upload(h, "all", "1.0.0", zipOf({ "index.html": "a" }))).status).toBe(201);
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", version: "1.0.0" });
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    await retireAppPointers(h.deps, app);
    await h.deps.db.deleteOrgData(ORG_A);
    expect(await h.deps.db.getAppByBundleId(APP)).toBeNull();
    const req = { app_id: APP, device_id: "d1", platform: "ios", version_name: "builtin" };
    expect(await checkUpdate(storePointerReader(h.deps.store), req)).toEqual(NO_UPDATE);
    const takeover = await upload(h, "other", "9.9.9", zipOf({ "index.html": "<script>steal()</script>" }));
    expect(takeover.status).toBe(409);
    expect(takeover.body.error).toBe("app_id_taken");
    expect(await checkUpdate(storePointerReader(h.deps.store), req)).toEqual(NO_UPDATE);
  });
});

describe("P0-3 concurrent pointer publishes", () => {
  it("a slow publisher holding stale state cannot undo a pause that landed meanwhile", async () => {
    const h = harness();
    await upload(h, "all", "1.0.0", zipOf({ "index.html": "a" }));
    await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", version: "1.0.0", percent: 50 });
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const ch = (await h.deps.db.listChannels(app.id))[0]!;
    const key = `ptr/${APP}/${ch.id}.json`;
    const put = h.deps.store.put.bind(h.deps.store);
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    let held = false;
    h.deps.store.put = async (k, d, o) => { if (k === key && !held) { held = true; await gate; } return put(k, d, o); };
    const slow = publishPointers(h.deps, app); // reads "not paused", then stalls on its first write
    while (!held) await new Promise((r) => setTimeout(r, 0));
    const paused = await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    expect(paused.status).toBe(200);
    open();
    await slow;
    const ptr = JSON.parse(new TextDecoder().decode((await h.deps.store.get(key))!));
    expect(ptr.paused).toBe(true);
    expect(await checkUpdate(storePointerReader(h.deps.store), { app_id: APP, device_id: "d1", platform: "ios", version_name: "builtin" })).toEqual(NO_UPDATE);
  });
});

describe("P0-4 production never runs on a volatile bundle store next to a real database", () => {
  it("refuses memory with Mongo and incomplete R2 settings, allows the all-memory demo", async () => {
    await expect(storeFromEnv({ NODE_ENV: "production", DB_DRIVER: "mongo" }, "https://x")).rejects.toThrow(/bundle store not configured/);
    expect((await storeFromEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://db" }, "https://x")).kind).toBe("mongo"); // lean launch: Mongo store by default
    await expect(storeFromEnv({ NODE_ENV: "production", DB_DRIVER: "mongo", R2_ACCOUNT_ID: "a", BUNDLE_STORE: "r2" }, "https://x")).rejects.toThrow(/bundle store not configured/);
    await expect(storeFromEnv({ NODE_ENV: "production", DB_DRIVER: "memory", BUNDLE_STORE: "r2" }, "https://x")).rejects.toThrow(/r2_incomplete/);
    expect((await storeFromEnv({ NODE_ENV: "production", DB_DRIVER: "memory" }, "https://x")).kind).toBe("memory");
    expect((await storeFromEnv({ NODE_ENV: "production", MONGODB_URI: "mongodb://db", BUNDLE_STORE: "memory" }, "https://x")).kind).toBe("memory");
    expect((await storeFromEnv({ NODE_ENV: "test", MONGODB_URI: "mongodb://db" }, "https://x")).kind).toBe("mongo");
  });
});

describe("P1 fixes", () => {
  it("device channel writes do not republish pointers when nothing changes", async () => {
    const h = harness();
    await upload(h, "all", "1.0.0", zipOf({ "index.html": "a" }));
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const ch = (await h.deps.db.listChannels(app.id))[0]!;
    await h.deps.db.updateChannel(app.id, ch.id, { allowSelfAssign: true }, ch.rev);
    let puts = 0;
    const put = h.deps.store.put.bind(h.deps.store);
    h.deps.store.put = async (k, d, o) => { if (k.startsWith("ptr/")) puts++; return put(k, d, o); };
    await selfAssignChannel(h.deps, { app_id: APP, device_id: "d1", channel: "production" });
    const first = puts;
    expect(first).toBeGreaterThan(0);
    await selfAssignChannel(h.deps, { app_id: APP, device_id: "d1", channel: "production" });
    await clearDeviceChannel(h.deps, { app_id: APP, device_id: "never-assigned" });
    expect(puts).toBe(first);
  });

  it("the health probe reports an unreachable or hanging database instead of ok", async () => {
    expect((await probeDb(async () => true)).ok).toBe(true);
    expect(await probeDb(async () => { throw new Error("ECONNREFUSED"); })).toMatchObject({ ok: false, error: "unreachable" });
    expect(await probeDb(() => new Promise(() => {}), 20)).toMatchObject({ ok: false, error: "timeout" });
  });

  it("admins can manage API keys (Better Auth checks apiKey:create/delete, not manage)", () => {
    for (const a of ["create", "delete", "read"]) { expect(can("admin", "apiKey", a)).toBe(true); expect(can("owner", "apiKey", a)).toBe(true); }
    expect(can("member", "apiKey", "create")).toBe(false);
    expect(can("viewer", "apiKey", "read")).toBe(false);
  });
});
