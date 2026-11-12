import { Albert_Sans, DM_Mono, Jost } from "next/font/google";

// Hotrail type system (docs/design-brief.md §4): a geometric grotesk for the board numerals and headings (Jost),
// a geometric text grotesk for reading and dense tables (Albert Sans), and a mono for commands and headcodes (DM Mono).
export const sans = Albert_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
export const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap", preload: false });
// "optional" for the display face: it is preloaded, so it is in place on a normal load, and a slow first visit keeps the
// metric-matched fallback instead of a late swap that would push LCP (the hero H1) back.
export const display = Jost({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-kit-display", display: "optional" });
