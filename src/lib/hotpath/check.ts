// The update hot path. Deliberately tiny and isolated: it imports only core and a pointer reader, never the DB,
// auth or the control services, so it can move to the Edge runtime unchanged (docs/ARCHITECTURE.md section 2).
// Every failure answers "no update"; the route always returns HTTP 200.

import { decideUpdate, NO_UPDATE, type UpdateRequest, type UpdateResponse } from "@buffersol/hotrail-core";

/** Anything that can read a small JSON document by key: R2 over fetch, memory in tests, KV or Redis later. */
export interface PointerReader {
  readJson<T>(key: string): Promise<T | null>;
}

export interface PointerIndexLike {
  v: 1;
  defaults: { ios?: string; android?: string };
  channels: Record<string, string>;
  overrides: Record<string, string>;
  selfAssign: string[];
}

export interface PointerLike {
  channelId: string;
  bundleVersion: string;
  url: string;
  checksum: string;
  rolloutPercent: number;
  paused: boolean;
  limited?: boolean;
  sessionKey?: string;
  allowedNativeBuilds?: string[];
  enforceNativeBuilds?: boolean;
}

const indexKey = (bundleId: string) => `ptr/${bundleId}/index.json`;
const channelKey = (bundleId: string, channelId: string) => `ptr/${bundleId}/${channelId}.json`;
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface Resolved {
  channelId: string | null;
  source: "override" | "default" | "none";
  index: PointerIndexLike | null;
}

/** Per device override first, else the platform's default channel. */
export async function resolveChannel(reader: PointerReader, req: Pick<UpdateRequest, "app_id" | "device_id" | "platform">): Promise<Resolved> {
  if (!SAFE_ID.test(req.app_id ?? "")) return { channelId: null, source: "none", index: null };
  const index = await reader.readJson<PointerIndexLike>(indexKey(req.app_id));
  if (!index || index.v !== 1) return { channelId: null, source: "none", index: null };
  const ov = req.device_id ? index.overrides?.[req.device_id] : undefined;
  if (ov) return { channelId: ov, source: "override", index };
  const platform = req.platform === "ios" || req.platform === "android" ? req.platform : undefined;
  const def = platform ? index.defaults?.[platform] : (index.defaults?.ios ?? index.defaults?.android);
  return def ? { channelId: def, source: "default", index } : { channelId: null, source: "none", index };
}

export async function checkUpdate(reader: PointerReader, req: UpdateRequest): Promise<UpdateResponse> {
  try {
    if (!req || typeof req !== "object" || typeof req.app_id !== "string" || typeof req.device_id !== "string") return NO_UPDATE;
    const r = await resolveChannel(reader, req);
    if (!r.channelId) return NO_UPDATE;
    let pointer = await reader.readJson<PointerLike>(channelKey(req.app_id, r.channelId));
    // A device pinned to a channel by an override is not subject to that channel's staged rollout percent.
    if (pointer && r.source === "override") pointer = { ...pointer, rolloutPercent: 100 };
    return await decideUpdate(pointer, req);
  } catch {
    return NO_UPDATE;
  }
}
