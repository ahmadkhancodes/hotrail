import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { nativeFingerprint, type NativeInfo } from "@buffersol/hotrail-core";

export interface HotrailConfig {
  appId: string;
  channel: string;
  dir: string;
  apiUrl?: string;
}

export function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return null; }
}

/** appId from capacitor.config.json / .ts / .js (simple regex, no code execution). */
export function detectAppId(cwd: string): string | null {
  for (const name of ["capacitor.config.json", "capacitor.config.ts", "capacitor.config.js"]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    const m = /["']?appId["']?\s*:\s*["']([^"']+)["']/.exec(src);
    if (m) return m[1]!;
  }
  return null;
}

export function detectWebDir(cwd: string): string {
  for (const name of ["capacitor.config.json", "capacitor.config.ts", "capacitor.config.js"]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    const m = /["']?webDir["']?\s*:\s*["']([^"']+)["']/.exec(readFileSync(p, "utf8"));
    if (m) return m[1]!;
  }
  return "dist";
}

interface PackageJson { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

export function readPackage(cwd: string): PackageJson {
  return readJson<PackageJson>(join(cwd, "package.json")) ?? {};
}

export function usesCapgoUpdater(cwd: string): boolean {
  const p = readPackage(cwd);
  return "@capgo/capacitor-updater" in { ...p.dependencies, ...p.devDependencies };
}

const clean = (v: string) => v.replace(/^[^\d]*/, "");

/** Native layer = @capacitor/core + every dependency that ships native code (@capacitor/*, capacitor-*, @capacitor-community/*, @capawesome*). */
export function nativeInfo(cwd: string): NativeInfo {
  const deps = { ...readPackage(cwd).dependencies };
  const plugins: Record<string, string> = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (name === "@capacitor/core" || name === "@capacitor/cli") continue;
    if (/^(@capacitor\/|@capacitor-community\/|@capawesome|capacitor-)/.test(name) || name.includes("capacitor-")) plugins[name] = clean(ver);
  }
  return { capacitor: clean(deps["@capacitor/core"] ?? "0.0.0"), plugins };
}

export const fingerprintOf = (cwd: string) => nativeFingerprint(nativeInfo(cwd));

/** Never shipped in a bundle: the signing key folder, VCS data and env files (a bundle is public on the CDN). */
const SECRET_NAMES = /^(\.hotrail|\.git|\.env(\..*)?|\.npmrc)$/;

export function walk(dir: string): { path: string; abs: string }[] {
  const out: { path: string; abs: string }[] = [];
  const rec = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === ".DS_Store" || SECRET_NAMES.test(e)) continue;
      const abs = join(d, e);
      // lstat: a symlink is skipped, never followed (it could point outside the build folder or loop).
      const st = lstatSync(abs);
      if (st.isDirectory()) rec(abs);
      else if (st.isFile()) out.push({ path: relative(dir, abs).split("\\").join("/"), abs });
    }
  };
  rec(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}
