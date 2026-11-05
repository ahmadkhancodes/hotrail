import { Atkinson_Hyperlegible, Barlow_Condensed, Red_Hat_Mono } from "next/font/google";

// Hotrail type system (docs/DESIGN.md §6): condensed railway display, hyperlegible body, mono for data.
export const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-kit-sans", display: "swap" });
export const mono = Red_Hat_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap" });
export const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-kit-display", display: "swap" });
