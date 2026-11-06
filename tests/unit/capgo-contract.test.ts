import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkUpdate } from "@/lib/hotpath/check";
import { classifyAction, clearDeviceChannel, getDeviceChannel, ingestStats, selfAssignChannel, storePointerReader } from "@/lib/ship/device";
import { harness } from "./helpers/ship";
import { writeZip } from "@/lib/ship/zip";

// Contract test: the update API answers the stock @capgo/capacitor-updater with exactly the shapes it expects, so a
// migration only changes updateUrl, statsUrl and channelUrl. Fixtures live in tests/fixtures/capgo (public docs, clean room).
const fx = <T,>(f: string) => JSON.parse(readFileSync(new URL(`../fixtures/capgo/${f}`, import.meta.url), "utf8")) as T;
const request = fx<Record<string, unknown>>("update-request.json");
const spec = fx<{ deltaKeys: string[]; update: Record<string, string>; noUpdate: Record<string, string>; allowedKeys: string[]; statsRequest: Record<string, unknown>; statsActions: string[]; channelGet: Record<string, unknown>; channelSetOk: Record<string, string> }>("responses.json");

const APP = "com.example.ordering";
async function live(version = "2.14.1") {
  const h = harness();
  const zip = writeZip([{ path: "index.html", data: new TextEncoder().encode("<html>hi</html>") }]);
  expect((await h.call("all", "POST", `bundles?appId=${APP}&version=${version}`, zip)).status).toBe(201);
  expect((await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: "1A00", percent: 100 })).status).toBe(200);
  return h;
}

function assertCapgoShape(res: Record<string, unknown>) {
  for (const k of Object.keys(res)) expect(spec.allowedKeys).toContain(k);
  if ("url" in res || "version" in res) {
    expect(typeof res.version).toBe("string");
    expect(typeof res.url).toBe("string");
    expect(String(res.url)).toMatch(/^https?:\/\//);
    expect(typeof res.checksum).toBe("string");
    if ("session_key" in res) expect(typeof res.session_key).toBe("string");
  } else {
    expect(typeof res.message).toBe("string");
  }
}

describe("update API response shape equals what @capgo/capacitor-updater reads", () => {
  it("the fixture request (every field the plugin sends) gets an update with the fixture's keys", async () => {
    const h = await live();
    const res = (await checkUpdate(storePointerReader(h.deps.store), request as never)) as Record<string, unknown>;
    assertCapgoShape(res);
    // Hotrail adds the optional delta fields; everything else is exactly the stock shape.
    expect(Object.keys(res).filter((k) => !spec.deltaKeys.includes(k)).sort()).toEqual(Object.keys(spec.update).sort());
    expect(res.manifest_url).toMatch(/\/manifests\//);
    expect(res.files_url).toMatch(/\/blobs\//);
    expect(res.version).toBe("2.14.1");
    expect(res.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no update answers carry only a message, for every refusal reason", async () => {
    const h = await live();
    const reader = storePointerReader(h.deps.store);
    const cases: Record<string, unknown>[] = [
      { ...request, version_name: "2.14.1" }, // already current
      { ...request, app_id: "com.unknown.app" }, // unknown app
      { ...request, device_id: undefined }, // malformed
      {}, // empty body
      { ...request, platform: "windows" },
    ];
    for (const c of cases) {
      const res = (await checkUpdate(reader, c as never)) as Record<string, unknown>;
      assertCapgoShape(res);
      if (c.platform === "windows" && "version" in res) continue; // unknown platform falls back to the default channel
      expect(res).toEqual(spec.noUpdate);
    }
    // paused channel
    await h.call("all", "POST", "channels/pause", { appId: APP, channel: "production" });
    expect(await checkUpdate(reader, request as never)).toEqual(spec.noUpdate);
  });

  it("a thrown error still yields HTTP 200 shaped no update (hot path never throws)", async () => {
    const reader = { readJson: async () => { throw new Error("storage down"); } };
    expect(await checkUpdate(reader as never, request as never)).toEqual(spec.noUpdate);
  });

  it("statsUrl accepts the plugin's beacon body and every documented action without an error", async () => {
    const h = await live();
    const out = await ingestStats(h.deps, spec.statsRequest as never);
    expect(out).toEqual({ stored: true });
    for (const a of spec.statsActions) await expect(ingestStats(h.deps, { ...(spec.statsRequest as object), action: a } as never)).resolves.toBeDefined();
    expect(classifyAction("update_fail")).toBe("failed");
    expect(classifyAction("set")).toBe("applied");
    expect(classifyAction("ping")).toBe("other");
    // unknown app and garbage never throw either
    await expect(ingestStats(h.deps, { app_id: "nope", device_id: "d", action: "set" })).resolves.toEqual({ stored: false });
  });

  it("channelUrl get / set / delete answer the shapes the plugin reads", async () => {
    const h = await live();
    const got = await getDeviceChannel(h.deps, { app_id: APP, device_id: String(request.device_id), platform: "ios" });
    expect(Object.keys(got).sort()).toEqual(Object.keys(spec.channelGet).sort());
    expect(got).toEqual({ ...spec.channelGet, status: "default" });
    // a channel that does not allow self assignment refuses; one that does answers {status:"ok"}
    await expect(selfAssignChannel(h.deps, { app_id: APP, device_id: "d1", channel: "production" })).rejects.toMatchObject({ status: 403 });
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const ch = (await h.deps.db.getChannelByName(app.id, "production"))!;
    await h.deps.db.updateChannel(app.id, ch.id, { allowSelfAssign: true });
    const set = await selfAssignChannel(h.deps, { app_id: APP, device_id: "d1", channel: "production" });
    expect(set.status).toBe(spec.channelSetOk.status);
    expect(await clearDeviceChannel(h.deps, { app_id: APP, device_id: "d1" })).toEqual({ status: "ok" });
  });

  it("migration check: only the three URLs differ, so the request shape needs no field rename", () => {
    const sent = Object.keys(request).sort();
    expect(sent).toEqual(["app_id", "custom_id", "device_id", "is_emulator", "is_prod", "platform", "plugin_version", "version_build", "version_code", "version_name", "version_os"]);
  });
});
