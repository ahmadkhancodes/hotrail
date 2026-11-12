import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// Hotrail type system (docs/design-brief.md §4): expanded grotesque display, engineering text face, mono for figures.
export const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap", preload: false });
// "optional" for the display face: it is preloaded, so it is in place on a normal load, and a slow first visit keeps the
// metric-matched fallback instead of a late swap that would push LCP (the hero H1) back.
export const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-kit-display", display: "optional" });
