import type { Interval } from "@/config/product";
import { planById } from "@/config/product";

/**
 * Same-origin paths only. Anything else (absolute URLs, //host, backslashes) falls back. Browsers drop tabs and
 * newlines from URLs, so "/\t/evil.example" became "//evil.example" (SECURITY-REVIEW S-2): any control character or
 * whitespace is refused, and the result must still resolve to our own origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || next.length > 2048 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://self.invalid");
    if (u.origin !== "https://self.invalid") return fallback;
  } catch {
    return fallback;
  }
  return next;
}

/** Where to go after sign-in: pricing hand-off (?plan&interval) wins, then ?next, then /app. */
export function afterSignIn(p: { next?: string | null; plan?: string | null; interval?: string | null }): string {
  const plan = p.plan ? planById(p.plan) : undefined;
  if (plan && plan.id !== "free") {
    const interval: Interval = p.interval === "month" ? "month" : "year";
    return `/app/billing?plan=${plan.id}&interval=${interval}`;
  }
  return safeNext(p.next);
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
