import { describe, expect, it } from "vitest";
import { checkNativeCompat, nativeFingerprint } from "../src";

const info = (plugins: Record<string, string>, capacitor = "8.0.0") => ({ capacitor, plugins });

describe("checkNativeCompat", () => {
  it("same fingerprint is compatible", async () => {
    const fp = await nativeFingerprint(info({ "@capacitor/camera": "8.2.0" }));
    expect(checkNativeCompat({ fingerprint: fp }, { versionBuild: "41", fingerprint: fp })).toEqual({ ok: true, reasons: [] });
  });
  it("a build that lacks a required plugin is refused with the plugin name", () => {
    const r = checkNativeCompat(
      { fingerprint: "a", info: info({ "@capacitor/camera": "8.2.0" }) },
      { versionBuild: "41", fingerprint: "b", info: info({}) },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["build 41 lacks @capacitor/camera"]);
  });
  it("a superset build on the same majors is compatible", () => {
    const r = checkNativeCompat(
      { fingerprint: "a", info: info({ "@capacitor/camera": "8.2.0" }) },
      { versionBuild: "42", fingerprint: "b", info: info({ "@capacitor/camera": "8.4.1", "@capacitor/haptics": "8.0.0" }) },
    );
    expect(r.ok).toBe(true);
  });
  it("a Capacitor or plugin major mismatch is refused", () => {
    const r = checkNativeCompat(
      { fingerprint: "a", info: info({ "@capacitor/camera": "8.2.0" }) },
      { versionBuild: "40", fingerprint: "b", info: info({ "@capacitor/camera": "7.0.0" }, "7.4.0") },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });
  it("without info on either side a different fingerprint is refused; the allow list overrides", () => {
    const bundle = { fingerprint: "a" };
    const build = { versionBuild: "40", fingerprint: "b" };
    expect(checkNativeCompat(bundle, build).ok).toBe(false);
    expect(checkNativeCompat({ ...bundle, allowedBuilds: ["40"] }, build).ok).toBe(true);
  });
});

import { decideUpdate } from "../src";
describe("decideUpdate with enforced native builds", () => {
  const base = { channelId: "c", bundleVersion: "2.0.0", url: "u", checksum: "x", rolloutPercent: 100, paused: false };
  const req = { app_id: "a", device_id: "d", version_name: "1.0.0", version_build: "41" };
  it("an empty enforced list refuses everyone, an unenforced empty list allows everyone", async () => {
    expect(await decideUpdate({ ...base, allowedNativeBuilds: [], enforceNativeBuilds: true }, req)).toEqual({ message: "no_new_version_available" });
    expect(await decideUpdate({ ...base, allowedNativeBuilds: [] }, req)).toMatchObject({ version: "2.0.0" });
    expect(await decideUpdate({ ...base, allowedNativeBuilds: ["41"], enforceNativeBuilds: true }, req)).toMatchObject({ version: "2.0.0" });
  });
});
