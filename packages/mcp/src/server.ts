import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zipDir } from "./zip";

export interface ServerOptions { apiKey: string; apiUrl: string; fetchImpl?: typeof fetch }

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface Channel { name: string; headcode: string | null; version: string | null; previousHeadcode: string | null; percent: number; paused: boolean; lamp: string; devices: number; failureRate: number }
interface Bundle { headcode: string; version: string; devices: number; failureRate: number; channels: string[] }
interface Line { app: { bundleId: string; name: string }; channels: Channel[]; bundles: Bundle[]; totals: { devices: number } }

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ isError: true, content: [{ type: "text" as const, text: t }] });
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function createServer(o: ServerOptions): McpServer {
  const f = o.fetchImpl ?? fetch;
  const base = o.apiUrl.replace(/\/+$/, "");

  async function call<T>(method: string, path: string, body?: BodyInit, contentType = "application/json"): Promise<T> {
    const res = await f(base + path, {
      method,
      headers: { authorization: `Bearer ${o.apiKey}`, "content-type": contentType, "user-agent": "hotrail-mcp/0.1" },
      body,
    });
    const raw = await res.text();
    let json: unknown;
    try { json = raw ? JSON.parse(raw) : undefined; } catch { /* non JSON */ }
    if (!res.ok) {
      const j = (json ?? {}) as { error?: string; hint?: string };
      throw new ApiError(res.status, `${j.error ?? `request_failed_${res.status}`}${j.hint ? `: ${j.hint}` : ""} (HTTP ${res.status})`);
    }
    return json as T;
  }
  const q = (appId: string) => `appId=${encodeURIComponent(appId)}`;
  const line = (appId: string) => call<Line>("GET", `/api/v1/line?${q(appId)}`);

  /** Run a tool body; API and local errors become isError results instead of protocol errors. */
  const guard = (fn: () => Promise<ReturnType<typeof text>>) => async () => {
    try { return await fn(); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  };

  const server = new McpServer({ name: "hotrail", version: "0.1.0" });
  const appId = z.string().min(3).max(128).describe("App id (the Capacitor appId, e.g. com.example.app)");
  const channel = z.string().min(1).max(32).describe("Channel name, e.g. production");

  server.registerTool("upload", {
    description: "Upload a web build as a new immutable bundle. Does not release it to any channel. Give either dir (a build directory, zipped by this server) or zipPath (an existing zip). Returns the bundle headcode.",
    inputSchema: { appId, version: z.string().min(1).max(64).describe("Semver version, e.g. 1.4.0"), dir: z.string().optional().describe("Build directory, e.g. dist"), zipPath: z.string().optional().describe("Path to an existing zip of the build") },
  }, (a) => guard(async () => {
    if (!!a.dir === !!a.zipPath) throw new Error("Provide exactly one of dir or zipPath.");
    const zip = a.zipPath ? new Uint8Array(readFileSync(a.zipPath)) : zipDir(a.dir!);
    const r = await call<{ headcode: string; version: string; signed: boolean }>("POST", `/api/v1/bundles?${q(a.appId)}&version=${encodeURIComponent(a.version)}`, zip as BodyInit, "application/zip");
    return text(`Uploaded ${r.version} as ${r.headcode} (signed: ${r.signed}). It is not live yet; release it with the release tool.`);
  })());

  server.registerTool("release", {
    description: "Release a bundle to a channel at a rollout percent. Changes what devices receive, so it requires confirm: true. Without it this is a dry run that changes nothing.",
    inputSchema: { appId, channel, bundle: z.string().max(8).optional().describe("Bundle headcode"), version: z.string().max(64).optional().describe("Bundle version (alternative to bundle)"), percent: z.number().min(0).max(100).optional().describe("Rollout percent, default 100"), confirm: z.boolean().optional().describe("Must be true to actually release") },
  }, (a) => guard(async () => {
    if (!a.bundle && !a.version) throw new Error("Provide bundle (headcode) or version.");
    const percent = a.percent ?? 100;
    if (a.confirm !== true) {
      const cur = (await line(a.appId)).channels.find((c) => c.name === a.channel);
      return text(`DRY RUN, nothing changed. Would release ${a.bundle ? `bundle ${a.bundle}` : `version ${a.version}`} to channel ${a.channel} at ${percent}%. ` +
        `The channel currently serves ${cur?.headcode ? `${cur.headcode} (${cur.version}) at ${cur.percent}%` : "nothing"}. Call release again with confirm: true to proceed.`);
    }
    const r = await call<{ headcode: string; version: string; percent: number; channel: string }>("POST", "/api/v1/channels/release", JSON.stringify({ appId: a.appId, channel: a.channel, bundle: a.bundle, version: a.version, percent }));
    return text(`Released ${r.headcode} (${r.version}) to ${r.channel} at ${r.percent}%.`);
  })());

  server.registerTool("rollback", {
    description: "Roll a channel back to its previous bundle at 100%. Requires confirm: true; without it this is a dry run that changes nothing.",
    inputSchema: { appId, channel, confirm: z.boolean().optional().describe("Must be true to actually roll back") },
  }, (a) => guard(async () => {
    if (a.confirm !== true) {
      const cur = (await line(a.appId)).channels.find((c) => c.name === a.channel);
      if (!cur) throw new Error(`Channel ${a.channel} not found.`);
      return text(`DRY RUN, nothing changed. Channel ${a.channel} currently serves ${cur.headcode ?? "nothing"} (${cur.version ?? "n/a"}); a rollback would switch it to ${cur.previousHeadcode ?? "no previous bundle (it would fail)"} at 100%. Call rollback again with confirm: true to proceed.`);
    }
    const r = await call<{ headcode: string; version: string; channel: string }>("POST", "/api/v1/channels/rollback", JSON.stringify({ appId: a.appId, channel: a.channel }));
    return text(`Rolled ${r.channel} back to ${r.headcode} (${r.version}) at 100%.`);
  })());

  server.registerTool("stats", {
    description: "Read only summary of an app: channels, bundles, device totals and 24 hour failure rates.",
    inputSchema: { appId },
  }, (a) => guard(async () => {
    const l = await line(a.appId);
    const ch = l.channels.map((c) => `- ${c.name}: ${c.headcode ? `${c.headcode} (${c.version}) at ${c.percent}%` : "idle"}${c.paused ? " PAUSED" : ""}, ${c.devices} devices, failure ${pct(c.failureRate)}`);
    const bs = l.bundles.slice(0, 10).map((b) => `- ${b.headcode} ${b.version}: ${b.devices} devices, failure ${pct(b.failureRate)}${b.channels.length ? `, live on ${b.channels.join(", ")}` : ""}`);
    return text([`${l.app.name} (${l.app.bundleId}): ${l.channels.length} channels, ${l.bundles.length} bundles, ${l.totals.devices} devices.`, "Channels:", ...(ch.length ? ch : ["- none"]), "Bundles (latest 10):", ...(bs.length ? bs : ["- none"])].join("\n"));
  })());

  return server;
}
