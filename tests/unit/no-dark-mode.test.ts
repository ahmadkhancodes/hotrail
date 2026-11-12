import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// Hotrail is light only. This fails if dark mode or a theme toggle comes back.
const roots = ["src", "packages/plugin/src", "packages/cli/src", "packages/core/src", "packages/mcp/src"];
const exts = /\.(tsx?|css|html|mjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (exts.test(f)) out.push(p);
  }
  return out;
}

const banned: [string, RegExp][] = [
  ["dark: utility", /(^|[\s"'`:])dark:[a-z\[!-]/],
  ["prefers-color-scheme: dark", /prefers-color-scheme:\s*dark/],
  ["data-theme", /data-theme|dataset\.theme/],
  ["theme toggle", /ThemeToggle|themeInitScript|theme-toggle|theme-script/],
  ["theme localStorage key", /localStorage\.(get|set)Item\(\s*["']theme["']/],
  ["dark color-scheme", /color-scheme:\s*dark/],
  [".dark selector", /(^|[\s,}])\.dark\b/],
];

describe("light only", () => {
  const files = roots.flatMap((r) => walk(r));
  it("scans source files", () => expect(files.length).toBeGreaterThan(50));
  for (const [name, re] of banned) {
    it(`no ${name}`, () => {
      const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits).toEqual([]);
    });
  }
  it("declares color-scheme: light and one theme-color", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/color-scheme:\s*light/);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/themeColor:\s*"#/);
  });
});
