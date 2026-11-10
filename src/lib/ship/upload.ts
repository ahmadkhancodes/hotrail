import {
  buildManifest, checkArchive, checkFile, headcodeForIndex, isSemver, normalizePath, planUpload, sha256Hex, signManifest, verifyManifest,
  type Manifest, type NativeInfo, type PolicyViolation, POLICY_URL,
} from "@buffersol/hotrail-core";
import type { AppDoc, BundleDoc } from "@/lib/db/types";
import { open as openSecret } from "@/lib/crypto/secretbox";
import { HttpError } from "@/lib/http";
import { hmacSha256Hex, safeEqual, uuidv7 } from "@/lib/ids";
import { getJson, putJson } from "@/lib/storage/types";
import { ensureApp } from "./apps";
import { recordAudit, requireScope } from "./guard";
import { assertStorageWithin } from "./metering";
import { BLOB_URL_TTL_S, keys, MAX_BUNDLE_BYTES, MAX_REQUEST_BYTES, REQUEST_LIMIT_HINT, type Principal, type ShipDeps } from "./types";
import { checkZip, readEntry, ZipError, writeZip } from "./zip";

const SHA_RE = /^[0-9a-f]{64}$/;

export interface PlanInput {
  appId: string; // Capacitor appId
  version: string;
  manifest: Manifest;
  signature: string | null;
  publicKey?: string;
  nativeBuilds?: string[];
  native?: NativeInfo;
}

interface PendingUpload {
  native?: NativeInfo | null;
  manifest: Manifest;
  signature: string | null;
  nativeBuilds: string[];
  uploadBytes: number;
  by: string;
}

export interface UploadStats { totalBytes: number; uploadBytes: number; uploadRatio: number; changedFiles: number; baseVersion: string | null }

export interface FinalizeResult { bundleId: string; headcode: string; version: string; signed: boolean; stats: UploadStats }

export interface PlanResult { missing: string[]; uploads: Record<string, { url: string; headers?: Record<string, string> }>; reused: number }

const keyIdOf = async (pub: string) => (await sha256Hex(pub)).slice(0, 16);

function throwViolations(v: PolicyViolation[]): never {
  throw new HttpError(422, "native_file_blocked", { violations: v, policyUrl: POLICY_URL, hint: "Hotrail ships the web layer only. Native changes need a store release." });
}

function assertVersionFree(existing: BundleDoc | null, version: string): void {
  if (existing) throw new HttpError(409, "version_exists", { version, hint: "Bump the version. Bundles are immutable." });
}

/** Local signed PUT target, used when the store cannot presign (memory, fs). Size is part of the signature. */
export async function blobUploadUrl(deps: ShipDeps, appDocId: string, sha: string, size: number, now = deps.now()): Promise<string> {
  const exp = Math.floor(now.getTime() / 1000) + BLOB_URL_TTL_S;
  const sig = await hmacSha256Hex(deps.uploadSecret, `${appDocId}.${sha}.${size}.${exp}`);
  return `${deps.baseUrl.replace(/\/$/, "")}/api/v1/upload/blob/${sha}?app=${appDocId}&size=${size}&exp=${exp}&sig=${sig}`;
}

/** The PUT behind blobUploadUrl: no API key, the signature is the credential. */
export async function acceptBlob(deps: ShipDeps, q: { appDocId: string; sha: string; size: number; exp: number; sig: string }, body: Uint8Array): Promise<void> {
  if (!SHA_RE.test(q.sha) || !Number.isInteger(q.size) || q.size < 0) throw new HttpError(400, "invalid_blob");
  if (q.exp * 1000 < deps.now().getTime()) throw new HttpError(403, "upload_url_expired");
  const expected = await hmacSha256Hex(deps.uploadSecret, `${q.appDocId}.${q.sha}.${q.size}.${q.exp}`);
  if (!safeEqual(expected, q.sig)) throw new HttpError(403, "bad_upload_signature");
  if (body.byteLength !== q.size) throw new HttpError(422, "size_mismatch");
  if ((await sha256Hex(body)) !== q.sha) throw new HttpError(422, "hash_mismatch");
  await deps.store.put(keys.blob(q.appDocId, q.sha), body, { contentType: "application/octet-stream" });
}

function validateManifest(input: PlanInput): void {
  const m = input.manifest;
  if (!isSemver(input.version)) throw new HttpError(400, "invalid_version");
  if (m.schema !== 1 || m.appId !== input.appId || m.version !== input.version) throw new HttpError(400, "manifest_mismatch");
  if (!Array.isArray(m.files) || m.files.length === 0) throw new HttpError(400, "empty_bundle");
  const seen = new Set<string>();
  const violations: PolicyViolation[] = [];
  for (const f of m.files) {
    if (!SHA_RE.test(f.sha256) || !Number.isInteger(f.size) || f.size < 0) throw new HttpError(400, "invalid_manifest_file", { path: f.path });
    try { if (normalizePath(f.path) !== f.path) throw new Error("not normalized"); } catch { throw new HttpError(422, "unsafe_path", { path: f.path }); }
    if (seen.has(f.path)) throw new HttpError(422, "duplicate_path", { path: f.path });
    seen.add(f.path);
    const v = checkFile(f.path, new Uint8Array(0));
    if (v) violations.push(v);
  }
  if (violations.length) throwViolations(violations);
  const problem = checkArchive(m.files.map((f) => ({ name: f.path, compressedSize: f.size, uncompressedSize: f.size })));
  if (problem) throw new HttpError(422, "archive_rejected", { reason: problem });
  if (m.files.reduce((n, f) => n + f.size, 0) > MAX_BUNDLE_BYTES) throw new HttpError(413, "bundle_too_large", { limit: MAX_BUNDLE_BYTES });
}

/** Step 1 of the CLI upload: validate, verify the customer signature, say which blobs are missing and where to PUT them. */
export async function planBundle(deps: ShipDeps, p: Principal, input: PlanInput): Promise<PlanResult> {
  requireScope(p, "upload");
  validateManifest(input);
  const app = await ensureApp(deps, p, input.appId, "customer");
  await assertStorageWithin(deps, p.orgId, input.manifest.files.reduce((n, f) => n + f.size, 0));
  assertVersionFree(await deps.db.getBundleByVersion(app.id, input.version), input.version);

  const registered = app.signingPublicKey;
  if (input.signature) {
    const pub = registered ?? input.publicKey;
    if (!pub) throw new HttpError(400, "missing_public_key", { hint: "Send publicKey with the first signed upload." });
    const ok = await verifyManifest({ manifest: input.manifest, signature: input.signature, keyId: "" }, pub);
    if (!ok) throw new HttpError(400, "bad_signature", { hint: "The manifest was not signed with this app's key." });
    // A leaked upload-only key must not be able to register its own public key and lock the owner out.
    if (!registered && p.scope !== "all") throw new HttpError(403, "insufficient_scope", { need: "all", have: p.scope, hint: "Register the signing key with an all-scope key." });
    if (!registered) await deps.db.updateApp(app.id, { signingPublicKey: pub });
  } else if (registered) {
    throw new HttpError(400, "unsigned_not_allowed", { hint: "This app has a signing key, so every bundle must be signed." });
  }

  const missing: string[] = [];
  const uploads: PlanResult["uploads"] = {};
  const sizes = new Map<string, number>();
  for (const f of input.manifest.files) sizes.set(f.sha256, f.size);
  for (const [sha, size] of sizes) {
    if (await deps.store.has(keys.blob(app.id, sha))) continue;
    missing.push(sha);
    // Without object storage every blob goes through one function request, which the platform caps at about 4.5 MB.
    if (deps.store.kind !== "r2" && size > MAX_REQUEST_BYTES) throw new HttpError(413, "request_too_large", { limit: MAX_REQUEST_BYTES, hint: REQUEST_LIMIT_HINT });
    const presigned = await deps.store.presignPut(keys.blob(app.id, sha), { expiresInS: BLOB_URL_TTL_S, contentType: "application/octet-stream" });
    uploads[sha] = presigned ?? { url: await blobUploadUrl(deps, app.id, sha, size) };
  }
  const pending: PendingUpload = {
    manifest: input.manifest, signature: input.signature, nativeBuilds: input.nativeBuilds ?? [], native: input.native ?? null,
    uploadBytes: missing.reduce((n, s) => n + sizes.get(s)!, 0), by: p.actor,
  };
  await putJson(deps.store, keys.pending(app.id, input.version), pending);
  return { missing, uploads, reused: sizes.size - missing.length };
}

/** Step 2 of the CLI upload: re-verify every blob (size, sha256, magic bytes), assemble the zip, store, create the bundle. */
export async function finalizeBundle(deps: ShipDeps, p: Principal, input: { appId: string; version: string }): Promise<FinalizeResult> {
  requireScope(p, "upload");
  const app = await deps.db.getAppByBundleId(input.appId);
  if (!app || app.orgId !== p.orgId) throw new HttpError(404, "app_not_found");
  const pending = await getJson<PendingUpload>(deps.store, keys.pending(app.id, input.version));
  if (!pending) throw new HttpError(404, "no_pending_upload", { hint: "Run the upload again." });
  assertVersionFree(await deps.db.getBundleByVersion(app.id, input.version), input.version);

  const cache = new Map<string, Uint8Array>();
  const violations: PolicyViolation[] = [];
  const files: { path: string; data: Uint8Array }[] = [];
  for (const f of pending.manifest.files) {
    let data = cache.get(f.sha256);
    if (!data) {
      const got = await deps.store.get(keys.blob(app.id, f.sha256));
      if (!got) throw new HttpError(409, "missing_blob", { sha256: f.sha256, path: f.path });
      if (got.byteLength !== f.size) throw new HttpError(422, "size_mismatch", { path: f.path });
      if ((await sha256Hex(got)) !== f.sha256) {
        await deps.store.delete(keys.blob(app.id, f.sha256));
        throw new HttpError(422, "hash_mismatch", { path: f.path });
      }
      cache.set(f.sha256, (data = got));
    }
    const v = checkFile(f.path, data.subarray(0, 16));
    if (v) violations.push(v);
    files.push({ path: f.path, data });
  }
  if (violations.length) throwViolations(violations);
  const zip = writeZip(files);
  return commitBundle(deps, p, app, {
    version: input.version, manifest: pending.manifest, signature: pending.signature, zip,
    uploadBytes: pending.uploadBytes, nativeBuilds: pending.nativeBuilds, native: pending.native,
  });
}

export interface ZipUploadInput { appId: string; version: string; zip: Uint8Array; nativeFingerprint?: string; nativeBuilds?: string[]; native?: NativeInfo }

/** `POST /api/v1/bundles`: one request with a zip. The server inspects it, signs with the app's managed key and stores only new blobs. */
export async function uploadZipBundle(deps: ShipDeps, p: Principal, input: ZipUploadInput): Promise<FinalizeResult> {
  requireScope(p, "upload");
  if (!isSemver(input.version)) throw new HttpError(400, "invalid_version");
  if (input.zip.byteLength > MAX_BUNDLE_BYTES) throw new HttpError(413, "bundle_too_large", { limit: MAX_BUNDLE_BYTES });
  const app = await ensureApp(deps, p, input.appId, "managed");
  await assertStorageWithin(deps, p.orgId, input.zip.byteLength);
  if (app.signingMode !== "managed" || !app.signingKeyEnc) {
    throw new HttpError(409, "customer_signed_app", { hint: "This app signs bundles with your own key. Use `npx @buffersol/hotrail upload`." });
  }
  assertVersionFree(await deps.db.getBundleByVersion(app.id, input.version), input.version);

  let checked: ReturnType<typeof checkZip>;
  try { checked = checkZip(input.zip); } catch (e) { if (e instanceof ZipError) throw new HttpError(422, "invalid_zip", { reason: e.message }); throw e; }
  if (checked.problem) throw new HttpError(422, "archive_rejected", { reason: checked.problem });

  const files: { path: string; data: Uint8Array }[] = [];
  const violations: PolicyViolation[] = [];
  try {
    for (const e of checked.entries) {
      let path: string;
      try { path = normalizePath(e.name); } catch { throw new HttpError(422, "unsafe_path", { path: e.name }); }
      const data = readEntry(input.zip, e);
      const v = checkFile(path, data.subarray(0, 16));
      if (v) violations.push(v);
      files.push({ path, data });
    }
  } catch (e) {
    if (e instanceof ZipError) throw new HttpError(422, "invalid_zip", { reason: e.message });
    throw e;
  }
  if (violations.length) throwViolations(violations);
  if (files.length === 0) throw new HttpError(400, "empty_bundle");

  let manifest: Manifest;
  try {
    manifest = await buildManifest({ appId: input.appId, version: input.version, nativeFingerprint: input.nativeFingerprint ?? "unknown", files, createdAt: deps.now().toISOString() });
  } catch (e) { throw new HttpError(422, "invalid_zip", { reason: (e as Error).message }); }

  // Delta: store only blobs this app does not have yet.
  const byHash = new Map<string, Uint8Array>();
  for (const f of files) byHash.set(await sha256Hex(f.data), f.data);
  let uploadBytes = 0;
  for (const [sha, data] of byHash) {
    if (await deps.store.has(keys.blob(app.id, sha))) continue;
    await deps.store.put(keys.blob(app.id, sha), data, { contentType: "application/octet-stream" });
    uploadBytes += data.byteLength;
  }
  const priv = await openSecret(app.signingKeyEnc, await deps.kek(), app.id);
  const signed = await signManifest(manifest, priv, await keyIdOf(app.signingPublicKey ?? ""));
  // Devices download a zip we wrote from the inspected entries, never the customer's bytes: a crafted archive can hide
  // local entries (native binaries, `../` names, symlinks) from the central directory that a device unzipper would extract.
  return commitBundle(deps, p, app, { version: input.version, manifest, signature: signed.signature, zip: writeZip(files), uploadBytes, nativeBuilds: input.nativeBuilds ?? [], native: input.native });
}

interface Commit { version: string; manifest: Manifest; signature: string | null; zip: Uint8Array; uploadBytes: number; nativeBuilds: string[]; native?: NativeInfo | null }

async function commitBundle(deps: ShipDeps, p: Principal, app: AppDoc, c: Commit): Promise<FinalizeResult> {
  const id = uuidv7();
  const totalBytes = c.manifest.files.reduce((n, f) => n + f.size, 0);
  const prev = (await deps.db.listBundles(app.id, 1))[0];
  let changedFiles = c.manifest.files.length;
  if (prev) {
    const prevSigned = await getJson<{ manifest: Manifest }>(deps.store, prev.manifestKey);
    if (prevSigned) changedFiles = planUpload(c.manifest.files, new Set(prevSigned.manifest.files.map((f) => f.sha256))).missing.length;
  }
  const stats: UploadStats = { totalBytes, uploadBytes: c.uploadBytes, uploadRatio: totalBytes === 0 ? 0 : c.uploadBytes / totalBytes, changedFiles, baseVersion: prev?.version ?? null };

  const zipKey = keys.zip(app.id, id);
  const manifestKey = keys.manifest(app.id, id);
  const zipSha256 = await sha256Hex(c.zip);
  await deps.store.put(zipKey, c.zip, { contentType: "application/zip", cacheControl: "public, max-age=31536000, immutable" });
  await putJson(deps.store, manifestKey, { manifest: c.manifest, signature: c.signature, keyId: c.signature && app.signingPublicKey ? await keyIdOf(app.signingPublicKey) : "" }, { cacheControl: "public, max-age=31536000, immutable" });

  const headcode = headcodeForIndex(await deps.db.nextBundleSeq(app.id));
  let bundle: BundleDoc;
  try {
    bundle = await deps.db.createBundle({
      id, orgId: p.orgId, appId: app.id, version: c.version, headcode, nativeFingerprint: c.manifest.nativeFingerprint, nativeInfo: c.native ?? null,
      manifestKey, zipKey, zipSha256, sizeBytes: totalBytes, fileCount: c.manifest.files.length, signed: c.signature !== null,
      allowedNativeBuilds: c.nativeBuilds, delta: { baseVersion: stats.baseVersion, changedFiles, uploadBytes: stats.uploadBytes, totalBytes, uploadRatio: stats.uploadRatio },
      createdBy: p.actor, state: "active", createdAt: deps.now(),
    });
  } catch (e) {
    await deps.store.delete(zipKey);
    await deps.store.delete(manifestKey);
    if ((e as Error).message === "duplicate_version") throw new HttpError(409, "version_exists", { version: c.version });
    throw e;
  }
  await deps.store.delete(keys.pending(app.id, c.version));
  await recordAudit(deps, p, "bundle.uploaded", `${app.bundleId}@${c.version}`, { headcode, signed: bundle.signed, bytes: totalBytes, uploadBytes: stats.uploadBytes });
  await deps.emit(p.orgId, "bundle.uploaded", { app: app.bundleId, version: c.version, headcode, signed: bundle.signed }).catch(() => undefined);
  return { bundleId: bundle.id, headcode, version: c.version, signed: bundle.signed, stats };
}
