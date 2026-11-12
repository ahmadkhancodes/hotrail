import type { Page } from "@playwright/test";

/** In-page audit: fonts, banned colours, clipped text, horizontal scroll, text contrast. Returns human readable problems. */
export async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const parse = (c: string): [number, number, number, number] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
    const bgOf = (el: Element): number[] | null => {
      let c: number[] = [255, 255, 255];
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
      for (const e of chain.reverse()) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") return null; // gradients/images: cannot judge
        const b = parse(cs.backgroundColor);
        if (b && b[3] > 0) c = c.map((v, i) => Math.round(b[i]! * b[3] + v * (1 - b[3])));
      }
      return c;
    };
    if (document.documentElement.scrollWidth > innerWidth) out.push(`horizontal scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
    const fam = (el: Element) => getComputedStyle(el).fontFamily.toLowerCase();
    for (const sel of ["body", "h1", "h2", "code, pre"]) {
      const el = document.querySelector(sel);
      if (el && !/jost|albert|dm mono|dm_mono|__/.test(fam(el))) out.push(`font ${sel}: ${fam(el)}`);
    }
    const seen = new Set<string>();
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (/(archivo|plex|inter\b|roboto|geist|arial|times)/.test(cs.fontFamily.toLowerCase()) && !/jost|albert|mono|__/.test(cs.fontFamily.toLowerCase()) && el.textContent?.trim()) {
        const k = `fam ${cs.fontFamily}`; if (!seen.has(k)) { seen.add(k); out.push(`${k} on <${el.tagName.toLowerCase()}>`); }
      }
      const b = el.getBoundingClientRect();
      // clipped text: fixed overflow hidden boxes whose content is wider than the box (ellipsis is intentional)
      if (b.width && (cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && el.children.length + (el.textContent?.trim() ? 1 : 0) > 0 && !el.matches("[class*=sr-only], svg, svg *, img, [aria-hidden=true], [aria-hidden=true] *")) {
        const k = `clip ${el.tagName}.${String(el.className).slice(0, 40)}`; if (!seen.has(k)) { seen.add(k); out.push(`${k} ${el.scrollWidth}>${el.clientWidth}`); }
      }
      // contrast of direct text
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (own && b.width && b.height && !el.closest("[aria-hidden=true], svg, [disabled]")) {
        const fg = parse(cs.color); const bg = bgOf(el);
        if (fg && bg && fg[3] > 0.9 && cs.opacity === "1") {
          const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
          if (ratio < (big ? 3 : 4.5)) { const k = `contrast ${ratio.toFixed(2)} ${el.textContent?.trim().slice(0, 30)}`; if (!seen.has(k)) { seen.add(k); out.push(k); } }
        }
      }
    }
    return out;
  });
}
