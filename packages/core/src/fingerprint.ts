import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";

export interface NativeInfo {
  capacitor: string; // @capacitor/core version
  plugins: Record<string, string>; // native plugin name -> version
}

/** Stable id of the native layer a device runs. Plugin order and key order do not matter. */
export async function nativeFingerprint(info: NativeInfo): Promise<string> {
  const plugins = Object.fromEntries(Object.entries(info.plugins).sort(([a], [b]) => (a < b ? -1 : 1)));
  return (await sha256Hex(canonicalJson({ capacitor: info.capacitor, plugins }))).slice(0, 16);
}

/** Missing plugins in `device` compared to what a bundle requires. */
export function missingPlugins(required: NativeInfo, device: NativeInfo): string[] {
  return Object.keys(required.plugins).filter((p) => !(p in device.plugins));
}
