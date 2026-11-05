import { checkNativeCompat, nativeFingerprint, type NativeInfo } from "@buffersol/hotrail-core";
import type { AppDoc, BundleDoc, NativeBuildDoc } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { recordAudit, requireApp, requireScope } from "./guard";
import { publishPointers } from "./pointers";
import type { Principal, ShipDeps } from "./types";

export interface Incompatible { build: string; reasons: string[] }

/** Builds a bundle can run on, and the recorded builds it cannot (with the plain reasons the console shows). */
export function compatibilityOf(bundle: BundleDoc, builds: NativeBuildDoc[]): { allowed: string[]; incompatible: Incompatible[] } {
  const allowed = new Set<string>();
  const incompatible: Incompatible[] = [];
  for (const b of builds) {
    const c = checkNativeCompat(
      { fingerprint: bundle.nativeFingerprint, info: bundle.nativeInfo, allowedBuilds: bundle.allowedNativeBuilds },
      { versionBuild: b.versionBuild, fingerprint: b.fingerprint, info: b.info },
    );
    if (c.ok) allowed.add(b.versionBuild);
    else incompatible.push({ build: b.versionBuild, reasons: c.reasons });
  }
  // Builds the owner allowed explicitly work even when they are not recorded.
  for (const x of bundle.allowedNativeBuilds) allowed.add(x);
  return { allowed: [...allowed], incompatible };
}

/**
 * What the pointer carries for a bundle. An app with no recorded native builds keeps the old behaviour (explicit list or
 * any build). Once a build is recorded, delivery is an allow list: only builds known to be compatible get the bundle.
 */
export function pointerCompat(bundle: BundleDoc, builds: NativeBuildDoc[]): { allowedNativeBuilds: string[]; enforceNativeBuilds: boolean } {
  if (builds.length === 0) return { allowedNativeBuilds: bundle.allowedNativeBuilds, enforceNativeBuilds: false };
  return { allowedNativeBuilds: compatibilityOf(bundle, builds).allowed, enforceNativeBuilds: true };
}

export interface RegisterBuildInput { appId: string; versionBuild: string; native: NativeInfo; platform?: "all" | "ios" | "android" }

/** Records a store build's native fingerprint, then republishes pointers: a new build can make live bundles deliverable to it. */
export async function registerNativeBuild(deps: ShipDeps, p: Principal, input: RegisterBuildInput): Promise<{ versionBuild: string; fingerprint: string }> {
  requireScope(p, "upload");
  const app = await requireApp(deps, p, input.appId);
  if (!/^[A-Za-z0-9._+-]{1,32}$/.test(input.versionBuild)) throw new HttpError(400, "invalid_build");
  const fingerprint = await nativeFingerprint(input.native);
  await deps.db.recordNativeBuild({ appId: app.id, versionBuild: input.versionBuild, fingerprint, info: input.native, platform: input.platform ?? "all", recordedAt: deps.now() });
  await recordAudit(deps, p, "native_build.recorded", `${app.bundleId}#${input.versionBuild}`, { fingerprint });
  await publishPointers(deps, app);
  return { versionBuild: input.versionBuild, fingerprint };
}

export async function listNativeBuilds(deps: ShipDeps, p: Principal, bundleId: string): Promise<{ builds: { versionBuild: string; fingerprint: string; platform: string; recordedAt: string; devices: number }[] }> {
  requireScope(p, "read");
  const app = await requireApp(deps, p, bundleId);
  const [builds, counts] = await Promise.all([deps.db.listNativeBuilds(app.id), deps.db.deviceCounts(app.id, "versionBuild")]);
  return { builds: builds.map((b) => ({ versionBuild: b.versionBuild, fingerprint: b.fingerprint, platform: b.platform, recordedAt: b.recordedAt.toISOString(), devices: counts[b.versionBuild] ?? 0 })) };
}

export async function incompatibleFor(deps: ShipDeps, app: AppDoc, bundle: BundleDoc): Promise<Incompatible[]> {
  return compatibilityOf(bundle, await deps.db.listNativeBuilds(app.id)).incompatible;
}
