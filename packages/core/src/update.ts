import { inRollout } from "./bucket";

/** What the hot path reads from the channel pointer JSON (see docs/ARCHITECTURE.md section 2). */
export interface ChannelPointer {
  channelId: string;
  bundleVersion: string;
  url: string; // zip (compat) or manifest URL on the CDN host
  checksum: string; // sha256
  sessionKey?: string;
  /** Signed manifest on the CDN host. With `filesUrl` it enables delta downloads; absent means full zip only. */
  manifestUrl?: string;
  /** Base URL of the bundle's content-addressed files (`<filesUrl>/<sha256>`). */
  filesUrl?: string;
  rolloutPercent: number;
  paused: boolean;
  limited?: boolean; // plan limit reached: new downloads paused
  allowedNativeBuilds?: string[]; // empty/undefined = any, unless enforceNativeBuilds
  /** When true the list is a hard allow list even when empty (the app has recorded native builds). */
  enforceNativeBuilds?: boolean;
}

/** Capgo self hosted protocol request (public docs, clean room). */
export interface UpdateRequest {
  platform?: string;
  app_id: string;
  device_id: string;
  version_name?: string; // version currently running
  version_build?: string; // native build
  version_os?: string;
  plugin_version?: string;
  custom_id?: string;
  is_prod?: boolean;
  is_emulator?: boolean;
}

export type UpdateResponse =
  | { version: string; url: string; checksum: string; session_key?: string; manifest_url?: string; files_url?: string }
  | { message: string; error?: string };

export const NO_UPDATE: UpdateResponse = { message: "no_new_version_available" };

/**
 * Pure decision. Never throws: any problem means "no update" (the caller always answers HTTP 200).
 * Order: pointer present, not paused/limited, device not already on version, native compatible, in rollout.
 */
export async function decideUpdate(pointer: ChannelPointer | null | undefined, req: UpdateRequest): Promise<UpdateResponse> {
  try {
    if (!pointer || pointer.paused || pointer.limited) return NO_UPDATE;
    if (!req.device_id || !req.app_id) return NO_UPDATE;
    if (req.version_name === pointer.bundleVersion) return NO_UPDATE;
    const allowed = pointer.allowedNativeBuilds;
    if ((pointer.enforceNativeBuilds || (allowed && allowed.length > 0)) && (!req.version_build || !(allowed ?? []).includes(req.version_build))) return NO_UPDATE;
    if (!(await inRollout(req.device_id, pointer.channelId, pointer.rolloutPercent))) return NO_UPDATE;
    const res: UpdateResponse = { version: pointer.bundleVersion, url: pointer.url, checksum: pointer.checksum };
    const out = res as { session_key?: string; manifest_url?: string; files_url?: string };
    if (pointer.sessionKey) out.session_key = pointer.sessionKey;
    // Delta fields are optional and additive: stock Capgo clients ignore them, our plugin falls back to the zip without them.
    if (pointer.manifestUrl && pointer.filesUrl) { out.manifest_url = pointer.manifestUrl; out.files_url = pointer.filesUrl; }
    return res;
  } catch {
    return NO_UPDATE;
  }
}
