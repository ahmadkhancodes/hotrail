import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { product, cadenceCopy } from "@/config/product";

// Landing page compliance with .claude/skills/landing-page-design (B1 type scale, B5 hero width, B7 nav motion,
// B11 tagline reveal, "no hyphens in copy").
const css = readFileSync("src/app/globals.css", "utf8");
const read = (p: string) => readFileSync(p, "utf8");

// Tailwind steps in px: 12 14 16 18 20 24 30 36 48 60 72 96 128.
const STEPS = new Set([12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128]);

/** Words joined by a hyphen, ignoring identifiers (package names, paths, URLs, flags, ids such as ci-upload). */
function hyphenatedWords(text: string): string[] {
  return (text.match(/[^\s"'`(){}<>,;]+/g) ?? [])
    .filter((t) => /[A-Za-z]-[A-Za-z]/.test(t))
    .filter((t) => !/[@/.:_=]|^--|^ci-|^[a-z]+-[a-z]+-|^[a-z]{2}-[A-Z]{2}$/.test(t));
}

/** Visible text of a TSX file: JSX text and string literals, minus className and other attribute values. */
function visibleCopy(src: string): string {
  return src
    .replace(/className=(\{[^}]*\}|"[^"]*")/g, "")
    .replace(/\b(href|id|key|rel|labelledBy|scope|type|aria-[a-z]+|htmlFor|role|variant|size|tone|rhythm)=("[^"]*"|\{[^}]*\})/g, "")
    .replace(/^import .*$/gm, "")
    .replace(/^const \w+Class = .*$/gm, "")
    .replace(/\baria-hidden\b/g, "")
    // Utility class lists passed to cn() or variables.
    .replace(/"[^"]*\b(flex|text-|bg-|px-|py-|inline-|transition|border|min-h|heading-|body-|caption-|button-)[^"]*"/g, "")
    .replace(/cn\([^)]*\)/g, "");
}

describe("landing page compliance", () => {
  it("puts every font size in globals.css on a Tailwind step", () => {
    for (const m of css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
      const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
      expect(STEPS.has(px), `${m[0]} = ${px}px`).toBe(true);
    }
  });

  it("keeps weights at 700 or below and has no italics in the type styles", () => {
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(700);
    expect(css).not.toMatch(/font-style:\s*italic/);
  });

  it("caps the hero heading and subheading at 680px", () => {
    expect(css).toMatch(/@utility hero-measure \{ max-width: 680px; \}/);
    const hero = read("src/components/marketing/hero.tsx");
    expect(hero).toMatch(/<h1[^>]*hero-measure/);
    expect(hero).toMatch(/<p className="body-3 hero-measure/);
    expect(hero).not.toMatch(/max-w-5xl/);
    // A <br> in the h1 keeps a real space next to it, so textContent never glues two words.
    const page = read("src/app/(marketing)/page.tsx");
    const title = page.match(/title=\{<>(.*?)<\/>\}/)![1]!;
    for (const m of title.matchAll(/(.)<br[^>]*\/>(.)/g)) expect(m[1] === " " || m[1] === "}" || m[2] === " ").toBe(true);
    expect(title).toMatch(/\{" "\}<br/);
  });

  it("has one CTA above the fold (no secondary hero link)", () => {
    expect(read("src/components/marketing/hero.tsx")).not.toMatch(/secondaryCta/);
  });

  it("uses no hyphenated words in landing copy and plan copy", () => {
    const files = [
      "src/app/(marketing)/page.tsx",
      "src/components/marketing/hero.tsx",
      "src/components/marketing/final-cta.tsx",
      "src/components/marketing/faq.tsx",
      "src/components/marketing/how-it-works.tsx",
      "src/components/marketing/pricing-table.tsx",
      "src/components/marketing/release-board.tsx",
      "src/components/marketing/site-header.tsx",
      "src/components/marketing/site-footer.tsx",
      "src/app/not-found.tsx",
    ];
    for (const f of files) {
      const copy = visibleCopy(read(f)).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(hyphenatedWords(copy), f).toEqual([]);
    }
    const plans = product.plans.flatMap((p) => [p.name, p.tagline, ...p.highlights]);
    const strings = [product.description, ...plans, ...Object.values(cadenceCopy).flatMap((c) => Object.values(c))];
    for (const s of strings) expect(hyphenatedWords(s), s).toEqual([]);
  });

  it("removes single sided accent bars from landing cards and rows", () => {
    for (const f of ["src/components/marketing/release-board.tsx", "src/components/marketing/pricing-table.tsx", "src/components/ui/states.tsx"]) {
      expect(read(f), f).not.toMatch(/bg-marker-bar|border-t-2 border-t-rule|border-danger border-t-2/);
    }
  });

  it("floats a translucent blurred nav and staggers the mobile menu within the B7 limits", () => {
    const header = read("src/components/marketing/site-header.tsx");
    expect(header).toMatch(/fixed inset-x-0 top-2/);
    expect(header).toMatch(/bg-surface\/80[^"]*backdrop-blur/);
    expect(header).toMatch(/bg-surface\/95[^"]*backdrop-blur-xl/);
    expect(header).toMatch(/STAGGER_MS = 60/);
    expect(header).toMatch(/STAGGER_CAP_MS = 400/);
    expect(header).toMatch(/translate-y-6 opacity-0/);
    expect(header).not.toMatch(/duration-(75|100|150|200)\b/);
  });

  it("tagline reveal: per word observer, muted at 30%, full colour at once under reduced motion", () => {
    const reveal = read("src/components/marketing/tagline-reveal.tsx");
    expect(reveal).toMatch(/new IntersectionObserver/);
    expect(reveal).not.toMatch(/addEventListener\("scroll"/);
    expect(reveal).toMatch(/prefers-reduced-motion: reduce/);
    expect(reveal).toMatch(/hero-measure/);
    const muted = Number(css.match(/\.kit-word \{ opacity: ([\d.]+);/)![1]);
    expect(muted).toBeGreaterThanOrEqual(0.25);
    expect(muted).toBeLessThanOrEqual(0.35);
    expect(css).toMatch(/\.kit-word\[data-on="true"\] \{ opacity: 1; \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.kit-word \{ opacity: 1; transition: none; \}/);
    // Not stacked directly under the hero: another section comes first.
    const page = read("src/app/(marketing)/page.tsx");
    const heroEnd = page.indexOf("visual={<ReleaseBoard />}");
    const between = page.slice(heroEnd, page.indexOf("<TaglineReveal"));
    expect(between).toMatch(/<Section /);
  });
});
