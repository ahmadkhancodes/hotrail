import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The CLI exactly as npm would ship it (dist/bin.js from scripts/build-packages.mjs), run as a real process. */
export const CLI_BIN = resolve("packages/cli/dist/bin.js");

export function buildCli() {
  execFileSync(process.execPath, ["scripts/build-packages.mjs", "cli"], { stdio: "pipe" });
  if (!existsSync(CLI_BIN)) throw new Error("CLI bundle missing");
}

export function capacitorProject(appId: string, opts: { version?: string; capgo?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "hotrail-persona-"));
  const deps: Record<string, string> = { "@capacitor/core": "^8.0.0" };
  if (opts.capgo) deps["@capgo/capacitor-updater"] = "^7.0.0";
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "app", version: opts.version ?? "1.0.0", dependencies: deps }));
  writeFileSync(join(cwd, "capacitor.config.ts"), `const config = { appId: '${appId}', webDir: 'dist' };\nexport default config;`);
  mkdirSync(join(cwd, "dist"));
  writeFileSync(join(cwd, "dist", "index.html"), `<html><body>${appId}</body></html>`);
  return cwd;
}

/**
 * Runs a pasted shell snippet line by line: `export K=V` sets env, `npx @buffersol/hotrail …` runs the built CLI.
 * Returns each command's exit code and output so a spec can assert on what the user would see.
 */
export function runSnippet(snippet: string, cwd: string, baseEnv: Record<string, string> = {}) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? cwd, ...baseEnv };
  const runs: { line: string; status: number | null; stdout: string; stderr: string }[] = [];
  for (const raw of snippet.split("\n")) {
    const line = raw.trim();
    const ex = /^export ([A-Z_]+)=(\S+)$/.exec(line);
    if (ex) { env[ex[1]!] = ex[2]!; continue; }
    if (!line.startsWith("npx @buffersol/hotrail ")) continue;
    const args = line.slice("npx @buffersol/hotrail ".length).split(/\s+/);
    const r = spawnSync(process.execPath, [CLI_BIN, ...args], { cwd, env: env as NodeJS.ProcessEnv, encoding: "utf8" });
    runs.push({ line, status: r.status, stdout: r.stdout, stderr: r.stderr });
  }
  return runs;
}
