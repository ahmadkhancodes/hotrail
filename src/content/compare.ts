import { planById, product } from "@/config/product";
import type { CompareValue } from "@/components/marketing/compare-table";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  /** Date the competitor facts were last checked. */
  checkedOn: string;
  sources: { label: string; href: string }[];
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  fitNote: string;
  faq: { q: string; a: string }[];
}

/** Capgo list prices in USD per month (monthly / yearly billing), observed 3 Nov 2026 at capgo.app/pricing (brief, Competitors). */
export const capgoCheckedOn = "3 Nov 2026";
export const capgoList: Partial<Record<string, { month: number; year: number }>> = {
  solo: { month: 14, year: 12 },
  maker: { month: 39, year: 33 },
  team: { month: 99, year: 83 },
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const monthly = (id: string) => dollars(planById(id)?.prices.find((p) => p.interval === "month")?.usd ?? 0);
const yearlyPerMonth = (id: string) => dollars(Math.round((planById(id)?.prices.find((p) => p.interval === "year")?.usd ?? 0) / 12));

/** Compare-page data: add an entry and /compare/<slug> exists. Dated facts only, each with a source. */
export const comparisons: CompareEntry[] = [
  {
    slug: "capgo",
    competitor: "Capgo",
    title: `${product.name} vs Capgo: live updates for Capacitor`,
    description: `${product.name} and Capgo compared on price, free plan, rollouts, auto-pause, signing and compliance. Competitor facts checked ${capgoCheckedOn}.`,
    headline: `${product.name} vs Capgo`,
    intro: `Both ship the web layer of a Capacitor app to installed devices. ${product.name} lists about half of Capgo's price on every tier and adds a free plan. Capgo is the established option with more certifications. Competitor facts below were checked ${capgoCheckedOn}.`,
    checkedOn: capgoCheckedOn,
    sources: [
      { label: "Capgo pricing", href: "https://capgo.app/pricing/" },
      { label: "Capgo self-hosted update protocol", href: "https://capgo.app/docs/plugin/self-hosted/handling-updates/" },
    ],
    rows: [
      { label: "Entry paid plan, monthly list price", values: [`Solo, $${capgoList.solo!.month}`, `Solo, ${monthly("solo")}`] },
      { label: "Entry paid plan, billed yearly (per month)", values: [`$${capgoList.solo!.year}`, yearlyPerMonth("solo")] },
      { label: "Mid plan, monthly (10,000 MAU)", values: [`Maker, $${capgoList.maker!.month}`, `Maker, ${monthly("maker")}`] },
      { label: "Large plan, monthly (100,000 MAU)", values: [`Team, $${capgoList.team!.month}`, `Team, ${monthly("team")}`] },
      { label: "Free plan", values: ["No, 14 day trial without a card", "Yes, 500 MAU, no card"] },
      { label: "Bandwidth meter", values: ["Yes", "No, fair use storage only"] },
      { label: "Device plugin license", values: ["MPL-2.0", "MIT"] },
      { label: "SOC 2 Type II and ISO 27001", values: [true, "Not yet"] },
      { label: "SSO", values: ["Yes", "Team plan and up"] },
      { label: "Native cloud builds", values: [true, "Coming in v1"] },
      { label: "Works with the @capgo/capacitor-updater plugin", values: [true, "Yes, change three URLs"] },
    ],
    fitNote: `Choose Capgo if you need SOC 2 Type II or ISO 27001 paperwork today, or native cloud builds this quarter. Choose ${product.name} if price, a free plan, no bandwidth meter and signing on by default matter more. ${product.name} is pre-launch: rows marked coming are planned, not shipped.`,
    faq: [
      { q: `Is ${product.name} cheaper than Capgo?`, a: `On list prices checked ${capgoCheckedOn}: Capgo Solo is $14 a month and ${product.name} Solo is ${monthly("solo")}; Capgo Maker is $39 and ${product.name} Maker is ${monthly("maker")}; Capgo Team is $99 and ${product.name} Team is ${monthly("team")}. Prices change, so check both pages.` },
      { q: "Can I move from Capgo without changing my app code?", a: "If you use @capgo/capacitor-updater in self-hosted mode, you change three URLs (updateUrl, statsUrl, channelUrl) and swap the plugin at your next store build. See the quickstart." },
      { q: `Does ${product.name} have SOC 2?`, a: "Not yet. Capgo lists SOC 2 Type II and ISO 27001. We publish a security page, a DPA and a penetration test plan instead." },
    ],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
