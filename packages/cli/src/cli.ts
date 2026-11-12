import { appendFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildManifest, checkFile, generateSigningKeyPair, isSemver, planUpload, signManifest, sha256Hex, POLICY_URL,
  type SignedManifest,
} from "@buffersol/hotrail-core";
import { ApiError, createApi, type Api } from "./api";
import { detectAppId, detectWebDir, fingerprintOf, nativeInfo, readJson, readPackage, usesCapgoUpdater, walk, type HotrailConfig } from "./project";

export interface Io {
  cwd: string;
  env: Record<string, string | undefined>;
  out: (s: string) => void;
  err: (s: string) => void;
  fetchImpl?: typeof fetch;
}

const NAME = "Hotrail by BufferSol";
const HELP = `${NAME}

Usage: npx @buffersol/hotrail <command> [options]

  init                         Detect your app, create hotrail.json and a signing key
  upload [--dir d] [--version x.y.z] [--unsigned]
                               Hash, sign and upload a web build (only new files are sent)
  release --channel c [--bundle 2K47 | --version x.y.z] [--percent n] [--autopause 0.02]
                               Point a channel at a bundle (default: the version in package.json)
  rollback --channel c         Reverse a channel to its previous bundle
  native register --build 41 [--platform ios|android]
                               Record this store build's native fingerprint (run after each store release)
  status                       Show channels, bundles and rollout state

Environment: HOTRAIL_API_KEY (required), HOTRAIL_API_URL (default https://hotrail.buffersoltech.com)
`;

export function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string | true> } {
  const [cmd = "", ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) { flags[key] = next; i++; } else flags[key] = true;
  }
  return { cmd, flags };
}

const str = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);

function loadConfig(io: Io): HotrailConfig {
  const c = readJson<HotrailConfig>(join(io.cwd, "hotrail.json"));
  if (!c) throw new ApiError(0, "hotrail.json not found.", "Run `npx @buffersol/hotrail init` in your project first.");
  return c;
}

function makeApi(io: Io, cfg: HotrailConfig): Api {
  const apiKey = io.env.HOTRAIL_API_KEY;
  if (!apiKey) throw new ApiError(0, "HOTRAIL_API_KEY is not set.", "Create a key in Settings, API keys, then export HOTRAIL_API_KEY.");
  return createApi({ baseUrl: safeApiUrl(io.env.HOTRAIL_API_URL ?? cfg.apiUrl ?? DEFAULT_URL), apiKey, fetchImpl: io.fetchImpl });
}

const DEFAULT_URL = "https://hotrail.buffersoltech.com";
/** Host used in printed snippets and doc links: HOTRAIL_API_URL when set and valid, else hotrail.json, else production. */
function docsBase(io: Io): string {
  const raw = io.env.HOTRAIL_API_URL ?? readJson<HotrailConfig>(join(io.cwd, "hotrail.json"))?.apiUrl ?? DEFAULT_URL;
  try { return new URL(raw).origin; } catch { return DEFAULT_URL; }
}

/** Ready-to-paste plugin setup with the project's real appId, host and public key (keys match HotrailConfig in the plugin). */
export function pluginSnippet(appId: string, base: string, publicKey: string): string {
  return `import { HotrailUpdater } from "@buffersol/hotrail-updater";

await HotrailUpdater.configure({
  appId: "${appId}",
  updateUrl: "${base}/api/v1/updates/check",
  statsUrl: "${base}/api/v1/updates/stats",
  channelUrl: "${base}/api/v1/updates/channel",
  publicKey: "${publicKey}",
});
await HotrailUpdater.notifyAppReady();`;
}

/** The API key is sent to this URL, and hotrail.json is a repo file anyone can edit: https only (plain http for localhost). */
export function safeApiUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ApiError(0, `API URL "${raw}" is not a valid URL.`); }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new ApiError(0, `Refusing to send your API key to ${u.origin}.`, "Use an https URL in hotrail.json or HOTRAIL_API_URL.");
  }
  return raw;
}

async function init(io: Io): Promise<void> {
  const appId = detectAppId(io.cwd);
  if (!appId) {
    io.err(`No Capacitor project found (capacitor.config.* with an appId).\nRun init in the folder that holds capacitor.config.ts or .json. Guide: ${docsBase(io)}/docs/quickstart`);
    throw new ApiError(0, "no capacitor config");
  }
  const cfgPath = join(io.cwd, "hotrail.json");
  const cfg: HotrailConfig = { appId, channel: "production", dir: detectWebDir(io.cwd) };
  if (!existsSync(cfgPath)) writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  const keyPath = join(io.cwd, ".hotrail", "signing-key.json");
  if (!existsSync(keyPath)) {
    mkdirSync(join(io.cwd, ".hotrail"), { recursive: true });
    const kp = await generateSigningKeyPair();
    writeFileSync(keyPath, JSON.stringify(kp, null, 2) + "\n", { mode: 0o600 });
    const gi = join(io.cwd, ".gitignore");
    const cur = existsSync(gi) ? readFileSync(gi, "utf8") : "";
    if (!cur.split("\n").includes(".hotrail/")) appendFileSync(gi, (cur.endsWith("\n") || cur === "" ? "" : "\n") + ".hotrail/\n");
    io.out(`Created signing key at .hotrail/signing-key.json (added to .gitignore). Keep it private.`);
  }
  const pub = readJson<{ publicKey?: string }>(keyPath)?.publicKey;
  const base = docsBase(io);
  io.out(`App ${appId} ready. Web directory: ${cfg.dir}.`);
  if (usesCapgoUpdater(io.cwd)) {
    io.out("Found @capgo/capacitor-updater. Migration mode: point these three URLs at Hotrail in capacitor.config now, and swap to @buffersol/hotrail-updater at your next store build.");
    io.out(`\nplugins: {\n  CapacitorUpdater: {\n    updateUrl: "${base}/api/v1/updates/check",\n    statsUrl: "${base}/api/v1/updates/stats",\n    channelUrl: "${base}/api/v1/updates/channel",\n  },\n}\n`);
  } else {
    if (!("@buffersol/hotrail-updater" in { ...readPackage(io.cwd).dependencies })) {
      io.out("Next: npm install @buffersol/hotrail-updater && npx cap sync, then rebuild the native app once.");
    }
    if (pub) io.out(`Add this to your app's startup code (the public key lets devices verify every bundle):\n\n${pluginSnippet(appId, base, pub)}\n`);
  }
  io.out("Then: npx @buffersol/hotrail upload");
}

function head(abs: string): Uint8Array {
  const fd = openSync(abs, "r");
  try {
    const buf = new Uint8Array(16);
    const n = readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally { closeSync(fd); }
}

interface PlanResponse { missing: string[]; uploads: Record<string, { url: string; headers?: Record<string, string> }> }
interface FinalizeResponse { bundleId: string; headcode: string; version: string }

async function upload(io: Io, flags: Record<string, string | true>): Promise<void> {
  const cfg = loadConfig(io);
  const api = makeApi(io, cfg);
  const dir = resolve(io.cwd, str(flags.dir) ?? cfg.dir);
  if (!existsSync(dir)) throw new ApiError(0, `Build directory ${dir} not found.`, "Run your web build first, or pass --dir.");
  const version = str(flags.version) ?? (readJson<{ version?: string }>(join(io.cwd, "package.json"))?.version ?? "");
  if (!isSemver(version)) throw new ApiError(0, `Version "${version}" is not valid semver.`, "Pass --version 1.2.3.");

  const entries = walk(dir);
  if (entries.length === 0) throw new ApiError(0, `${dir} is empty.`);
  const violations = entries.map((e) => checkFile(e.path, head(e.abs))).filter((v) => v !== null);
  if (violations.length > 0) {
    for (const v of violations) io.err(`Rejected ${v!.path}: ${v!.reason}`);
    throw new ApiError(0, `Upload blocked: ${violations.length} native file(s). Hotrail ships the web layer only.`, `Policy: ${POLICY_URL}`);
  }

  const files = entries.map((e) => ({ path: e.path, data: new Uint8Array(readFileSync(e.abs)) }));
  const manifest = await buildManifest({ appId: cfg.appId, version, nativeFingerprint: await fingerprintOf(io.cwd), files });
  let signed: (SignedManifest | { manifest: typeof manifest; signature: null }) & { publicKey?: string };
  if (flags.unsigned === true) {
    signed = { manifest, signature: null };
    io.err("Warning: uploading unsigned. Devices with signature checking on will reject this bundle.");
  } else {
    const key = readJson<{ privateKey: string; publicKey?: string }>(join(io.cwd, ".hotrail", "signing-key.json"));
    if (!key) throw new ApiError(0, "No signing key found.", "Run `npx @buffersol/hotrail init`, or pass --unsigned.");
    // The public key is sent so the server can register it on the first signed upload and verify every later one.
    signed = { ...(await signManifest(manifest, key.privateKey)), publicKey: key.publicKey };
  }

  const plan = await api.post<PlanResponse>("/api/v1/upload/plan", { appId: cfg.appId, version, ...signed, native: nativeInfo(io.cwd) });
  const known = new Set(manifest.files.map((f) => f.sha256).filter((h) => !plan.missing.includes(h)));
  const local = planUpload(manifest.files, known);
  io.out(`${manifest.files.length} files, ${local.reused} already stored, uploading ${local.missing.length} (${(local.uploadRatio * 100).toFixed(1)}% of ${local.totalBytes} bytes).`);
  const byHash = new Map<string, Uint8Array>();
  for (const f of files) byHash.set(await sha256Hex(f.data), f.data);
  for (const h of plan.missing) {
    const target = plan.uploads[h];
    const data = byHash.get(h);
    if (!target || !data) throw new ApiError(0, `Server asked for unknown blob ${h.slice(0, 12)}.`);
    await api.put(target.url, data, target.headers);
  }
  const done = await api.post<FinalizeResponse>("/api/v1/upload/finalize", { appId: cfg.appId, version });
  io.out(`Uploaded ${done.version} as ${done.headcode}. Release it: npx @buffersol/hotrail release --channel ${cfg.channel} --bundle ${done.headcode}`);
}

async function release(io: Io, flags: Record<string, string | true>): Promise<void> {
  const cfg = loadConfig(io);
  const api = makeApi(io, cfg);
  const channel = str(flags.channel) ?? cfg.channel;
  const bundle = str(flags.bundle);
  // Same default as upload: the version in package.json, so `upload` then `release` needs no flags.
  const version = str(flags.version) ?? (bundle ? undefined : readJson<{ version?: string }>(join(io.cwd, "package.json"))?.version);
  if (!bundle && !version) throw new ApiError(0, "Say what to release.", "Pass --bundle 2K47 or --version 2.14.1.");
  const percent = flags.percent === undefined ? 100 : Number(flags.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new ApiError(0, "--percent must be between 0 and 100.");
  const autopause = flags.autopause === undefined ? undefined : Number(flags.autopause);
  if (autopause !== undefined && (!Number.isFinite(autopause) || autopause < 0 || autopause > 1)) throw new ApiError(0, "--autopause must be between 0 and 1.");
  const res = await api.post<{ headcode: string; percent: number; channel: string; incompatible?: { build: string; reasons: string[] }[] }>("/api/v1/channels/release", { appId: cfg.appId, channel, bundle, version, percent, autopauseThreshold: autopause });
  io.out(`Released ${res.headcode} to ${res.channel} at ${res.percent}%.`);
  for (const i of res.incompatible ?? []) io.out(`Not offered to store build ${i.build}: ${i.reasons.join("; ")}.`);
}

async function rollback(io: Io, flags: Record<string, string | true>): Promise<void> {
  const cfg = loadConfig(io);
  const api = makeApi(io, cfg);
  const channel = str(flags.channel) ?? cfg.channel;
  const res = await api.post<{ headcode: string; channel: string }>("/api/v1/channels/rollback", { appId: cfg.appId, channel });
  io.out(`Reversed ${res.channel} to ${res.headcode}. Devices pick it up on their next check.`);
}

async function native(io: Io, sub: string | undefined, flags: Record<string, string | true>): Promise<void> {
  if (sub !== "register") throw new ApiError(0, "Usage: hotrail native register --build <store build number>");
  const cfg = loadConfig(io);
  const api = makeApi(io, cfg);
  const build = str(flags.build);
  if (!build) throw new ApiError(0, "Say which store build this is.", "Pass --build 41 (the versionCode or CFBundleVersion of the store release).");
  const platform = str(flags.platform);
  if (platform !== undefined && platform !== "ios" && platform !== "android") throw new ApiError(0, "--platform must be ios or android.");
  const res = await api.post<{ versionBuild: string; fingerprint: string }>("/api/v1/native-builds", { appId: cfg.appId, versionBuild: build, native: nativeInfo(io.cwd), platform });
  io.out(`Recorded store build ${res.versionBuild} with native fingerprint ${res.fingerprint}.`);
}

async function status(io: Io): Promise<void> {
  const cfg = loadConfig(io);
  const api = makeApi(io, cfg);
  const res = await api.get<{ channels: { name: string; headcode: string | null; percent: number; paused: boolean }[] }>(`/api/v1/channels?appId=${encodeURIComponent(cfg.appId)}`);
  if (res.channels.length === 0) io.out("No trains on this line yet. Run `npx @buffersol/hotrail upload`.");
  for (const c of res.channels) io.out(`${c.name.padEnd(12)} ${(c.headcode ?? "none").padEnd(6)} ${String(c.percent).padStart(3)}%  ${c.headcode === null ? "○ idle" : c.paused ? "■ R paused" : c.percent < 100 ? "▲ A rolling out" : "● G live"}`);
}

export async function main(argv: string[], io: Io): Promise<number> {
  const { cmd, flags } = parseArgs(argv);
  try {
    switch (cmd) {
      case "init": await init(io); return 0;
      case "upload": await upload(io, flags); return 0;
      case "release": await release(io, flags); return 0;
      case "rollback": await rollback(io, flags); return 0;
      case "status": await status(io); return 0;
      case "native": await native(io, argv[1], flags); return 0;
      case "": case "help": case "--help": io.out(HELP); return 0;
      default: io.err(`Unknown command "${cmd}".\n\n${HELP}`); return 2;
    }
  } catch (e) {
    if (e instanceof ApiError) {
      io.err(e.status ? `Error (${e.status}): ${e.message}` : `Error: ${e.message}`);
      if (e.hint) io.err(e.hint);
    } else io.err(`Unexpected error: ${(e as Error).message}`);
    return 1;
  }
}
