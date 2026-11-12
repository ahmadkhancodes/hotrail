import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The "working timetable" system (docs/design-brief.md). Fails if the banned AI tells or the old system come back.
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
    expect(fonts).toMatch(/Archivo\(/);
    expect(fonts).toMatch(/IBM_Plex_Sans\(/);
    expect(fonts).toMatch(/IBM_Plex_Mono\(/);
    for (const [p, s] of files) expect(s, p).not.toMatch(/\b(Inter|Geist|Roboto|Barlow_Condensed|Atkinson_Hyperlegible)\b\s*\(/);
  });

  it("uses paper white, ink actions and the yellow marker, not the old cream and navy", () => {
    expect(css).toMatch(/--surface: var\(--n-0\)/);
    expect(css).toMatch(/--action: var\(--n-900\)/);
    expect(css).toMatch(/--marker-500: #ffd23f/);
    for (const [p, s] of files) expect(s.toLowerCase(), p).not.toMatch(/#f6f5f0|#14284b|#4f46e5|#6366f1|#7c3aed/);
  });

  it("keeps containers square and controls at 2px", () => {
    expect(css).toMatch(/--radius-sm: 2px/);
    expect(css).toMatch(/--radius-md: 0px/);
    expect(css).toMatch(/--radius-lg: 0px/);
    for (const [p, s] of files) expect(s, p).not.toMatch(/rounded-(xl|2xl|3xl)\b/);
  });

  it("has no gradients, glass, arbitrary type sizes or pill badges", () => {
    for (const [p, s] of files) {
      expect(s, p).not.toMatch(/bg-gradient|linear-gradient|radial-gradient|backdrop-blur/);
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
