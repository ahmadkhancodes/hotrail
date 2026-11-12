import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The "departure board" system (docs/design-brief.md). Fails if the banned AI tells or the old system come back.
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk("src").map((p) => [p, readFileSync(p, "utf8")] as const);
const css = readFileSync("src/app/globals.css", "utf8");

describe("design system", () => {
  it("loads the brief's type pairing and no default faces", () => {
    const fonts = readFileSync("src/app/fonts.ts", "utf8");
    expect(fonts).toMatch(/Jost\(/);
    expect(fonts).toMatch(/Albert_Sans\(/);
    expect(fonts).toMatch(/DM_Mono\(/);
    for (const [p, s] of files) expect(s, p).not.toMatch(/\b(Inter|Geist|Roboto|Barlow_Condensed|Atkinson_Hyperlegible|Archivo|IBM_Plex_Sans|IBM_Plex_Mono|Red_Hat_Mono)\b\s*\(/);
  });

  it("uses cobalt on bright white for actions, rules and the marker", () => {
    expect(css).toMatch(/--surface: var\(--n-0\)/);
    expect(css).toMatch(/--n-0: #ffffff/);
    expect(css).toMatch(/--cobalt-600: #1546c9/);
    expect(css).toMatch(/--action: var\(--cobalt-600\)/);
    expect(css).toMatch(/--rule: var\(--cobalt-600\)/);
    expect(css).toMatch(/--plate: var\(--cobalt-600\)/);
    expect(css).toMatch(/@utility numeral-1 \{/);
  });

  it("has none of the old brand colours left (yellow marker, black actions, cream, navy, indigo)", () => {
    // #ffd23f signal yellow, #0e1012 old ink, #2b3036 old hover, #1859d6 old focus, #f6f5f0 cream, #14284b navy, mail #181818.
    const old = /#ffd23f|#0e1012|#2b3036|#1859d6|#f6f5f0|#14284b|#181818|#4f46e5|#6366f1|#7c3aed/;
    for (const [p, s] of files) expect(s.toLowerCase(), p).not.toMatch(old);
    for (const [p, s] of files) expect(s, p).not.toMatch(/\b(border|bg)-text(?![-\w])/);
  });

  it("keeps containers square and controls at 2px", () => {
    expect(css).toMatch(/--radius-sm: 2px/);
    expect(css).toMatch(/--radius-md: 0px/);
    expect(css).toMatch(/--radius-lg: 0px/);
    for (const [p, s] of files) expect(s, p).not.toMatch(/rounded-(xl|2xl|3xl)\b/);
  });

  it("has no gradients, glass, arbitrary type sizes or pill badges", () => {
    for (const [p, s] of files) {
      expect(s, p).not.toMatch(/bg-gradient|linear-gradient|radial-gradient/);
      // Glass only on the floating nav (B7: translucent bar over a background blur).
      if (!p.endsWith("site-header.tsx")) expect(s, p).not.toMatch(/backdrop-blur/);
      expect(s, p).not.toMatch(/\btext-\[\d/);
      expect(s, p).not.toMatch(/rounded-full[^"]*\b(px-|py-)[^"]*caption/);
    }
  });

  it("labels the hero board as example data and fills the live bar once", () => {
    const board = readFileSync("src/components/marketing/release-board.tsx", "utf8");
    expect(board).toContain("Example data");
    expect(css).toMatch(/\.rb-bar \{ animation: rb-fill 700ms/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms/);
  });
});
