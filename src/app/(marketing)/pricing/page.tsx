import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { capgoCheckedOn } from "@/content/compare";
import { plans, product, type MeterId } from "@/config/product";

const title = "Pricing";
const description = `${product.name} plans: Free, Solo, Maker and Team, with Scale on request. Priced by monthly active users, with no bandwidth meter and no seats.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing" },
};

const billingFaq = [
  { q: "What is a monthly active user?", a: "A distinct device that checks for an update in the calendar month (UTC). It is the only billing meter." },
  { q: "What happens if I go over my limit?", a: "Your app keeps running its current version. We pause new downloads and ask you to upgrade. On paid plans you can set a monthly overage cap so downloads keep flowing past the limit; extra MAU is shown at $0.0015 each and is not charged yet (metered billing is coming)." },
  { q: "Do I need a credit card for the Free plan?", a: "No. Start on Free with no card and move to a paid plan when you need more." },
  { q: "Can I pay monthly instead of yearly?", a: "Yes. Solo, Maker and Team can be billed monthly or yearly. The annual saving is shown in dollars on each plan." },
  { q: "When do build minutes start?", a: "Native cloud builds ship in v1. The minutes are listed so you can compare plans, but they are not available yet." },
];

const gib = (n: number) => (n >= 1024 ? `${n / 1024} TB` : `${n} GiB`);
const rows: { label: string; value: (l: Record<MeterId, number>) => string }[] = [
  { label: "Monthly active users", value: (l) => l.mau.toLocaleString("en-US") },
  { label: "Storage (fair use)", value: (l) => gib(l.storage_gib) },
  { label: "Event retention", value: (l) => `${l.event_days} days` },
  { label: "Build minutes a month (v1)", value: (l) => (l.build_min ? `${l.build_min.toLocaleString("en-US")}, coming` : "None") },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: product.fullName,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  offers: plans.map((p) => {
    const m = p.prices.find((x) => x.interval === "month");
    return { "@type": "Offer", name: p.name, price: ((m?.usd ?? 0) / 100).toFixed(2), priceCurrency: "USD" };
  }),
};

export default function PricingPage() {
  return (
    <>
      <Section labelledBy="pricing-title">
        <h1 className="sr-only">{title}</h1>
        <PricingTable title="Half the fare. Same line." />
        <p className="body-3 mt-8 max-w-2xl text-text-subtle">No bandwidth meter. No seats. Hit your limit and your app keeps running; we pause new downloads and ask. Capgo list prices are monthly, checked {capgoCheckedOn}.</p>
      </Section>
      <Section tone="raised" labelledBy="limits-title">
        <h2 id="limits-title" className="heading-4 md:heading-3 text-text">Limits by plan</h2>
        <div role="region" aria-label="Plan limits, scrolls sideways on small screens" tabIndex={0} className="mt-8 overflow-x-auto rounded-md border border-border bg-surface focus-visible:focus-ring">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <caption className="sr-only">Limits for each Hotrail plan</caption>
            <thead>
              <tr className="border-b border-border-strong">
                <th scope="col" className="sticky left-0 bg-surface-raised px-4 py-3 caption-3 text-text-subtle">Limit</th>
                {plans.map((p) => <th key={p.id} scope="col" className="px-4 py-3 title-4 text-text">{p.name}</th>)}
                <th scope="col" className="px-4 py-3 title-4 text-text">{product.scale.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-b-0">
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-3 body-5 text-text">{r.label}</th>
                  {plans.map((p) => <td key={p.id} className="px-4 py-3 font-mono caption-2 tabular-nums text-text">{r.value(p.limits)}</td>)}
                  <td className="px-4 py-3 body-6 text-text-subtle">Talk to us</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
