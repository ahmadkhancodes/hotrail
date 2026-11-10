/**
 * THE single source of product identity, plans, limits, flags and copy constants.
 * KIT_COPY.md step 2: a new product edits this file (and the tokens in globals.css) and nothing else in src/lib.
 */

export type PlanId = "free" | "solo" | "maker" | "team";
export type Interval = "month" | "year";
/** mau is the billing meter. storage_gib is fair use, event_days is retention, build_min is included build minutes. */
export type MeterId = "mau" | "storage_gib" | "event_days" | "build_min";

export interface PlanPrice {
  interval: Interval;
  /** USD cents. Real prices only (playbook §2). */
  usd: number;
  /** Stripe lookup key, always `${product.slug}_${plan}_${interval}` (app isolation, C-28). */
  lookupKey: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Empty for the free plan. */
  prices: PlanPrice[];
  limits: Record<MeterId, number>;
  /** Short plain-text differences shown in the pricing table. */
  highlights: string[];
  cta: string;
  featured?: boolean;
  /** Days of trial. 0 = no trial (Hotrail: the Free plan is the trial). */
  trialDays: number;
}

const slug = "hotrail";
const price = (plan: PlanId, interval: Interval, usd: number): PlanPrice => ({
  interval,
  usd,
  lookupKey: `${slug}_${plan}_${interval === "month" ? "monthly" : "annual"}`,
});

export const product = {
  slug,
  name: "Hotrail",
  fullName: "Hotrail by BufferSol",
  company: "BufferSol Technologies",
  companyUrl: "https://buffersoltech.com",
  host: "hotrail.buffersoltech.com",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://hotrail.buffersoltech.com",
  supportEmail: "contact@buffersoltech.com",
  legalEmail: "contact@buffersoltech.com",
  mailFrom: "Hotrail <hello@hotrail.buffersoltech.com>",
  description:
    "Live updates for Capacitor apps. Push the web layer straight to installed apps with channels, staged rollouts, auto-pause and one-click rollback, with signing on by default and no third party in your update path.",
  tagline: "Fix your Capacitor app today. Not after review.",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies LLC",
    jurisdiction: "the State of New York, United States",
    address: "447 W Broadway, 2nd Floor Suite #1964, New York, NY 10013, United States",
    effectiveDate: "2026-11-05",
  },
  subProcessors: [
    { name: "Vercel Inc.", purpose: "Hosting and edge network", location: "United States" },
    { name: "MongoDB Inc. (Atlas)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
    { name: "Cloudflare, Inc.", purpose: "Bundle storage (R2) and delivery", location: "United States and global edge network" },
    { name: "Stripe Inc.", purpose: "Payments and invoicing", location: "United States" },
    { name: "Email delivery provider", purpose: "Transactional email until our own mail servers are live", location: "United States" },
  ],
  currency: "usd" as const,
  /** Default billing interval shown first in the pricing toggle. */
  defaultInterval: "year" as Interval,
  plans: [
    {
      id: "free",
      name: "Free",
      tagline: "For one side project and a first live update",
      prices: [],
      limits: { mau: 500, storage_gib: 10, event_days: 7, build_min: 0 },
      highlights: ["500 monthly active users", "2 apps", "10 GiB fair use storage", "7 day event history", "Community support"],
      cta: "Start free",
      trialDays: 0,
    },
    {
      id: "solo",
      name: "Solo",
      tagline: "For indie developers shipping every week",
      prices: [price("solo", "month", 699), price("solo", "year", 7188)],
      limits: { mau: 2000, storage_gib: 100, event_days: 30, build_min: 60 },
      highlights: ["2,000 monthly active users", "Unlimited apps and members", "100 GiB fair use storage", "30 day event history", "60 build minutes a month (coming in v1)"],
      cta: "Choose Solo",
      trialDays: 0,
    },
    {
      id: "maker",
      name: "Maker",
      tagline: "For teams that need rollouts and auto-pause",
      prices: [price("maker", "month", 1999), price("maker", "year", 20388)],
      limits: { mau: 10000, storage_gib: 1024, event_days: 60, build_min: 300 },
      highlights: ["10,000 monthly active users", "Auto-pause rollouts and webhooks", "1 TB fair use storage", "60 day event history", "300 build minutes a month (coming in v1)"],
      cta: "Choose Maker",
      featured: true,
      trialDays: 0,
    },
    {
      id: "team",
      name: "Team",
      tagline: "For studios and apps with a large install base",
      prices: [price("team", "month", 4999), price("team", "year", 50388)],
      limits: { mau: 100000, storage_gib: 10240, event_days: 90, build_min: 1200 },
      highlights: ["100,000 monthly active users", "Priority email (SSO coming in v1)", "10 TB fair use storage", "90 day event history", "1,200 build minutes a month (coming in v1)"],
      cta: "Choose Team",
      trialDays: 0,
    },
  ] satisfies Plan[],
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 7,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  /** Sales-assisted tier: not a Stripe plan, shown as "talk to us" (brief, pricing table). */
  scale: {
    name: "Scale",
    tagline: "For Appflow migrations, SLAs and security reviews",
    fromUsdMonthly: 12499,
    highlights: ["1M monthly active users", "99.9% SLA and DPA", "Dedicated Slack channel", "Annual contract with migration help"],
  },
  nav: [
    { href: "/docs", label: "Docs" },
    { href: "/pricing", label: "Pricing" },
    { href: "/compare/capgo", label: "Compare" },
  ],
} as const;

export type Product = typeof product;
export const plans: readonly Plan[] = product.plans;
export const planById = (id: string): Plan | undefined => plans.find((p) => p.id === id);
export const freePlan = plans.find((p) => p.prices.length === 0) ?? plans[0]!;
export const allLookupKeys = (): string[] => plans.flatMap((p) => p.prices.map((x) => x.lookupKey));
export const planForLookupKey = (key: string | null | undefined): { plan: Plan; price: PlanPrice } | null => {
  if (!key) return null;
  for (const plan of plans) for (const p of plan.prices) if (p.lookupKey === key) return { plan, price: p };
  return null;
};
