import { docs } from "@/content/docs";

/** One code block from the public docs (/docs/<slug>), with where it came from. */
export interface DocSample { slug: string; heading: string; lang: string; code: string }

export function docSamples(): DocSample[] {
  return docs.flatMap((d) => d.sections.filter((s) => s.code).map((s) => ({ slug: d.slug, heading: s.heading, lang: s.code!.lang, code: s.code!.code })));
}

export type SampleKind = "cli" | "curl" | "device-urls" | "plugin-config" | "webhook-verify" | "json" | "mcp" | "ci";

/** Every sample must land in exactly one kind; a new doc block with an unknown shape fails the docs test until it gets a runner. */
export function kindOf(s: DocSample): SampleKind | null {
  if (s.lang === "yaml" && s.code.includes("npx @buffersol/hotrail ")) return "ci";
  if (s.lang === "bash" && s.code.startsWith("curl ")) return "curl";
  if (s.lang === "bash" && s.code.startsWith("claude mcp add")) return "mcp";
  if (s.lang === "bash" && s.code.split("\n").every((l) => !l.trim() || l.startsWith("#") || l.startsWith("export ") || l.startsWith("npx @buffersol/hotrail "))) return "cli";
  if (s.lang === "ts" && s.code.includes("HotrailUpdater.configure(")) return "plugin-config";
  if ((s.lang === "ts" || s.lang === "text") && /updateUrl/.test(s.code) && /statsUrl/.test(s.code) && /channelUrl/.test(s.code)) return "device-urls";
  if (s.lang === "js" && s.code.includes("export function verify(")) return "webhook-verify";
  if (s.lang === "json") return "json";
  return null;
}

/** CLI argv lines from a shell or CI block; `export K=V` lines become env. Non-Hotrail CI steps (npm ci, build) are skipped. */
export function cliSteps(code: string): ({ env: [string, string] } | { argv: string[] })[] {
  const out: ({ env: [string, string] } | { argv: string[] })[] = [];
  for (const raw of code.split("\n")) {
    const line = raw.replace(/^\s*(-\s+run:|-)\s+/, "").trim();
    const env = /^export ([A-Z_]+)=(\S+)$/.exec(line);
    if (env) { out.push({ env: [env[1]!, env[2]!] }); continue; }
    if (!line.startsWith("npx @buffersol/hotrail ")) continue;
    out.push({ argv: shellWords(line.slice("npx @buffersol/hotrail ".length)) });
  }
  return out;
}

function shellWords(s: string): string[] {
  return (s.match(/"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^"|"$/g, ""));
}

/** Absolute URLs in a block, e.g. the three device endpoints. */
export const urlsIn = (code: string): string[] => code.match(/https?:\/\/[^\s"',]+/g) ?? [];
