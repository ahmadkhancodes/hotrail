import type { NativeInfo } from "./fingerprint";

/** What the server knows about a store build (native layer) of an app. */
export interface BuildNative {
  versionBuild: string; // the store build string devices send as `version_build`
  fingerprint: string;
  info?: NativeInfo | null;
}

/** What a bundle was made against. `info` is optional: older uploads only carry the fingerprint. */
export interface BundleNative {
  fingerprint: string;
  info?: NativeInfo | null;
  /** Builds the owner explicitly allowed (override). */
  allowedBuilds?: string[];
}

export interface Compat {
  ok: boolean;
  /** Plain sentences for the console, e.g. "build lacks @capacitor/camera". Empty when ok. */
  reasons: string[];
}

const major = (v: string) => v.replace(/^[^\d]*/, "").split(".")[0] ?? "0";

/**
 * Can this bundle run on this native build?
 * 1. Explicit allow list wins. 2. Same fingerprint is compatible. 3. With full info on both sides a build that has
 * every plugin the bundle needs, on the same Capacitor major and same plugin majors, is compatible (a superset is fine).
 * 4. Otherwise it is refused, with the reasons.
 */
export function checkNativeCompat(bundle: BundleNative, build: BuildNative): Compat {
  if (bundle.allowedBuilds?.includes(build.versionBuild)) return { ok: true, reasons: [] };
  if (bundle.fingerprint === build.fingerprint) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  if (bundle.info && build.info) {
    if (major(bundle.info.capacitor) !== major(build.info.capacitor)) {
      reasons.push(`bundle needs Capacitor ${major(bundle.info.capacitor)}, build ${build.versionBuild} has Capacitor ${major(build.info.capacitor)}`);
    }
    for (const [name, ver] of Object.entries(bundle.info.plugins)) {
      const have = build.info.plugins[name];
      if (have === undefined) reasons.push(`build ${build.versionBuild} lacks ${name}`);
      else if (major(have) !== major(ver)) reasons.push(`${name} is ${have} in build ${build.versionBuild}, bundle needs ${ver}`);
    }
    return { ok: reasons.length === 0, reasons };
  }
  return { ok: false, reasons: [`native fingerprint differs (bundle ${bundle.fingerprint}, build ${build.versionBuild} ${build.fingerprint})`] };
}
