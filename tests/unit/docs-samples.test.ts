import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { main, type Io } from "../../packages/cli/src/cli";
import { configFromEnv } from "../../packages/mcp/src/config";
import { plans } from "@/config/product";
import { FREE_APP_LIMIT, appLimitDetails } from "@/lib/ship/apps";
import { setupSnippet } from "@/lib/onboarding/setup-snippet";
import { signPayload } from "@/lib/webhooks/outbound";
import { cliSteps, docSamples, kindOf, urlsIn, type DocSample } from "./helpers/doc-samples";
import { BASE, harness } from "./helpers/ship";

/**
 * "Docs must work": every code block on /docs is executed here against the in-process API (same router
 * as /api/v1/[...path]), or checked against the code it describes. curl blocks and the device URLs are
 * also run against the real `next start` server in tests/e2e/qa3/docs-live.spec.ts.
 */

const APP = "com.example.ordering";
const PLACEHOLDER_KEYS = new Set(["hr_xxx", "YOUR_API_KEY"]);
const PLACEHOLDER_HEADCODE = "2K47"; // the docs' example headcode; replaced by the bundle the runner uploaded

function project(opts: { capgo?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "hotrail-docs-"));
  const deps: Record<string, string> = { "@capacitor/core": "^8.0.0" };
  if (opts.capgo) deps["@capgo/capacitor-updater"] = "^7.0.0";
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ version: "2.14.1", dependencies: deps }));
  writeFileSync(join(cwd, "capacitor.config.ts"), `const config = { appId: '${APP}', webDir: 'dist' };\nexport default config;`);
  mkdirSync(join(cwd, "dist"));
  writeFileSync(join(cwd, "dist", "index.html"), "<html><script src=app.js></script></html>");
  writeFileSync(join(cwd, "dist", "app.js"), "console.log('v')");
  return cwd;
}

/** Runs CLI steps the way a user would paste them, in a fresh project and org. */
async function runCliBlock(code: string, opts: { capgo?: boolean } = {}) {
  const h = harness();
  const cwd = project(opts);
  const env: Record<string, string> = { HOTRAIL_API_KEY: "hr_all", HOTRAIL_API_URL: BASE };
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { cwd, env, out: (s) => out.push(s), err: (s) => err.push(s), fetchImpl: h.fetch };
  let headcode = "";
  const run = async (argv: string[]) => {
    const before = out.length;
    const code = await main(argv.map((a) => (a === PLACEHOLDER_HEADCODE ? headcode : a)), io);
    const up = out.slice(before).join("\n").match(/Uploaded \S+ as (\w+)/);
    if (up) headcode = up[1]!;
    return code;
  };
  const steps = cliSteps(code);
  const names = steps.flatMap((s) => ("argv" in s ? [s.argv[0]] : []));
  // State a reader of this page already has: an initialised project, and for pages that start after the
  // first upload, a released 2.14.0 plus the current 2.14.1 so rollback has somewhere to go.
  const setup: string[][] = [];
  if (!names.includes("init")) setup.push(["init"], ["upload", "--version", "2.14.0"], ["release", "--channel", "production", "--version", "2.14.0"]);
  if (!names.includes("init") && !names.includes("upload")) setup.push(["upload"], ["release", "--channel", "production"]);
  for (const s of setup) expect(await run(s), `setup ${s.join(" ")}: ${err.join("\n")}`).toBe(0);
  const results: { argv: string[]; code: number; out: string[]; err: string[] }[] = [];
  for (const s of steps) {
    if ("env" in s) {
      env[s.env[0]] = PLACEHOLDER_KEYS.has(s.env[1]) ? "hr_all" : s.env[1];
      continue;
    }
    const o = out.length;
    const e = err.length;
    const c = await run(s.argv);
    results.push({ argv: s.argv, code: c, out: out.slice(o), err: err.slice(e) });
  }
  return { results, h, cwd };
}

const samples = docSamples();
const label = (s: DocSample) => `/docs/${s.slug} "${s.heading}"`;

describe("docs code samples", () => {
  it("every sample has a runner (no untested code in the docs)", () => {
    expect(samples.length).toBeGreaterThan(20);
    const unknown = samples.filter((s) => kindOf(s) === null).map(label);
    expect(unknown).toEqual([]);
  });

  for (const s of samples.filter((x) => kindOf(x) === "cli" || kindOf(x) === "ci")) {
    it(`runs ${label(s)}`, async () => {
      const { results } = await runCliBlock(s.code, { capgo: s.slug === "migrating-from-capgo" || s.slug === "quickstart" });
      expect(results.length).toBeGreaterThan(0);
      // Warnings (stderr without "Error") are allowed, e.g. the --unsigned warning; failures are not.
      for (const r of results) expect({ cmd: r.argv.join(" "), code: r.code, err: r.err.filter((l) => /error/i.test(l)) }).toEqual({ cmd: r.argv.join(" "), code: 0, err: [] });
    });
  }

  it("--unsigned behaves as the signing doc says: allowed on a never-signed app, refused once it has a key", async () => {
    const doc = samples.length && (await import("@/content/docs")).getDoc("signing")!.sections.flatMap((x) => x.body).join(" ");
    expect(doc).toContain("unsigned_not_allowed");
    const fresh = await runCliBlock("npx @buffersol/hotrail init\nnpx @buffersol/hotrail upload --unsigned");
    expect(fresh.results.at(-1)!.code).toBe(0);
    expect(fresh.results.at(-1)!.err.join("\n")).toContain("Devices with signature checking on will reject this bundle.");
    const signed = await runCliBlock("npx @buffersol/hotrail upload --unsigned --version 3.0.0");
    expect(signed.results.at(-1)!.err).toContain("Error (400): unsigned_not_allowed");
  });

  it("the plugin setup uses only real HotrailConfig options and real HotrailUpdater methods", () => {
    const types = readFileSync("packages/plugin/src/types.ts", "utf8");
    const cfgBody = types.slice(types.indexOf("export interface HotrailConfig"), types.indexOf("}", types.indexOf("export interface HotrailConfig")));
    const options = new Set([...cfgBody.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]));
    const defs = readFileSync("packages/plugin/src/definitions.ts", "utf8");
    const api = defs.slice(defs.indexOf("export interface HotrailUpdaterApi"));
    for (const s of samples.filter((x) => kindOf(x) === "plugin-config")) {
      const block = s.code.slice(s.code.indexOf("configure({"), s.code.indexOf("});"));
      const used = [...block.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
      expect(used.length).toBeGreaterThan(3);
      for (const k of used) expect(options, `${label(s)} option ${k}`).toContain(k);
      for (const m of s.code.matchAll(/HotrailUpdater\.(\w+)\(/g)) expect(api, `${label(s)} method ${m[1]}`).toMatch(new RegExp(`\\b${m[1]}\\(`));
    }
  });

  it("device URLs in the docs are the three device routes that exist", () => {
    for (const s of samples.filter((x) => kindOf(x) === "device-urls" || kindOf(x) === "plugin-config")) {
      const paths = urlsIn(s.code).map((u) => new URL(u).pathname);
      expect(paths, label(s)).toEqual(["/api/v1/updates/check", "/api/v1/updates/stats", "/api/v1/updates/channel"]);
      for (const p of paths) expect(existsSync(`src/app${p}/route.ts`), p).toBe(true);
    }
  });

  it("the webhook verify() sample accepts a real Hotrail signature and rejects a tampered one", async () => {
    const s = samples.find((x) => kindOf(x) === "webhook-verify")!;
    const dir = mkdtempSync(join(tmpdir(), "hotrail-verify-"));
    writeFileSync(join(dir, "verify.mjs"), s.code);
    const { verify } = (await import(/* @vite-ignore */ pathToFileURL(join(dir, "verify.mjs")).href)) as { verify: (b: string, h: string, sec: string) => boolean };
    const body = JSON.stringify({ event: "channel.released", data: { headcode: "1A00" } });
    const header = await signPayload("whsec_docs", body);
    expect(verify(body, header, "whsec_docs")).toBe(true);
    expect(verify(body + " ", header, "whsec_docs")).toBe(false);
    expect(verify(body, header, "whsec_other")).toBe(false);
    expect(verify(body, await signPayload("whsec_docs", body, Math.floor(Date.now() / 1000) - 3600), "whsec_docs")).toBe(false);
  });

  it("the release response shown in the API doc matches what the API returns", async () => {
    const s = samples.find((x) => x.slug === "api" && x.code.includes('"headcode"'))!;
    const shown = JSON.parse(s.code) as Record<string, unknown>;
    const { h } = await runCliBlock("npx @buffersol/hotrail status");
    const real = await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", version: "2.14.1", percent: 25 });
    expect(real.status).toBe(200);
    for (const k of Object.keys(shown)) expect(Object.keys(real.body), `field ${k}`).toContain(k);
    expect(typeof real.body.headcode).toBe("string");
    expect(real.body.percent).toBe(25);
  });

  it("every JSON block parses", () => {
    for (const s of samples.filter((x) => kindOf(x) === "json")) expect(() => JSON.parse(s.code), label(s)).not.toThrow();
  });

  it("the MCP install line names the real package and the env var the server reads", () => {
    const s = samples.find((x) => kindOf(x) === "mcp")!;
    const pkg = JSON.parse(readFileSync("packages/mcp/package.json", "utf8")) as { name: string; bin: Record<string, string> };
    expect(s.code).toContain(`npx -y ${pkg.name}`);
    expect(Object.values(pkg.bin)[0]).toBe("./dist/bin.js");
    const key = /--env HOTRAIL_API_KEY=(\S+)/.exec(s.code)![1]!;
    expect(configFromEnv({ HOTRAIL_API_KEY: key }).apiKey).toBe(key);
  });
});

describe("commands on the landing page and in the console", () => {
  it("run in the order a visitor reads them", async () => {
    // Landing page: a new visitor's first run. Line view: the next upload of an app that is already live.
    for (const [f, min] of [["src/app/(marketing)/page.tsx", 3], ["src/app/app/line-view.tsx", 1]] as const) {
      const cmds = [...readFileSync(f, "utf8").matchAll(/npx @buffersol\/hotrail [^<"`]+/g)].map((m) => m[0].trim());
      expect(cmds.length, f).toBeGreaterThanOrEqual(min);
      const { results } = await runCliBlock([...new Set(cmds)].join("\n"));
      for (const r of results) expect({ f, cmd: r.argv.join(" "), code: r.code, err: r.err }).toEqual({ f, cmd: r.argv.join(" "), code: 0, err: [] });
    }
  });
});

describe("in-app setup snippet", () => {
  it("runs as shown with the user's real key: init, upload, release puts the app live", async () => {
    const snippet = setupSnippet({ apiKey: "hr_all", baseUrl: BASE });
    expect(snippet).toContain("export HOTRAIL_API_KEY=hr_all");
    expect(snippet).toContain(`export HOTRAIL_API_URL=${BASE}`);
    const { results, h } = await runCliBlock(snippet);
    expect(results.map((r) => r.argv[0])).toEqual(["init", "upload", "release"]);
    for (const r of results) expect(r.err).toEqual([]);
    expect(results.at(-1)!.out[0]).toBe("Released 1A00 to production at 100%.");
    const line = await h.call("all", "GET", `channels?appId=${APP}`);
    expect(line.body.channels.find((c: { name: string }) => c.name === "production")).toMatchObject({ headcode: "1A00", percent: 100 });
  });

  it("leaves out HOTRAIL_API_URL on production and shows a placeholder before a key exists", () => {
    const s = setupSnippet({ baseUrl: "https://hotrail.buffersoltech.com/" });
    expect(s).not.toContain("HOTRAIL_API_URL");
    expect(s.split("\n")[0]).toBe("export HOTRAIL_API_KEY=<create a key below>");
  });
});

describe("pricing numbers match enforced limits", () => {
  const fmt = (n: number) => n.toLocaleString("en-US");
  it("each plan's highlights state its real MAU limit and event history", () => {
    for (const pl of plans.filter((x) => x.limits.mau <= 100_000)) {
      expect(pl.highlights.join(" "), pl.id).toContain(`${fmt(pl.limits.mau)} monthly active users`);
      expect(pl.highlights.join(" "), pl.id).toContain(`${pl.limits.event_days} day event history`);
    }
  });
  it("Free says the app limit the server enforces, and the 402 points at the cheapest paid plan with its price", () => {
    const free = plans.find((x) => x.id === "free")!;
    expect(free.highlights).toContain(`${FREE_APP_LIMIT} apps`);
    const d = appLimitDetails("https://hotrail.example/");
    expect(d.upgradeUrl).toBe("https://hotrail.example/app/billing?plan=solo&interval=month");
    expect(d.hint).toBe(`The Free plan includes ${FREE_APP_LIMIT} apps. Solo ($6.99/mo) has unlimited apps. Upgrade: ${d.upgradeUrl}`);
    expect(plans.find((x) => x.id === "solo")!.highlights).toContain("Unlimited apps and members");
  });
});
