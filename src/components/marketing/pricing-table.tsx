"use client";
import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { product, plans, type Interval, type Plan, type PlanPrice } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { capgoList, capgoCheckedOn } from "@/content/compare";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The price shown for the chosen interval; a plan with only one interval shows that one. */
function priceFor(plan: Plan, interval: Interval): PlanPrice | null {
  if (plan.prices.length === 0) return null;
  return plan.prices.find((p) => p.interval === interval) ?? plan.prices[0] ?? null;
}

/** Dollars saved a year by paying annually, for a plan that sells both intervals. */
function yearlySaving(plan: Plan): number | null {
  const m = plan.prices.find((x) => x.interval === "month");
  const y = plan.prices.find((x) => x.interval === "year");
  return m && y ? m.usd * 12 - y.usd : null;
}

/** Board style figure: whole dollars set huge, cents set small and raised, so four plans fit one row. */
function Fare({ cents }: { cents: number }) {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return (
    <span className="numeral-3 xl:numeral-2 whitespace-nowrap text-text-accent">
      ${whole.toLocaleString("en-US")}
      {rest ? <span className="heading-6 align-top">.{String(rest).padStart(2, "0")}</span> : null}
    </span>
  );
}

const RISK_FREE = "No credit card needed.";
const RISK_PAID = "Cancel anytime from your account.";

export function PricingTable({ id = "pricing", title }: { id?: string; title?: string }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Annual" },
  ];

  return (
    <div id={id}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {title ? <h2 id={`${id}-title`} className="heading-4 md:heading-2 text-text">{title}</h2> : <span />}
        <div className="flex flex-col gap-2 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit border border-action bg-surface">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "min-h-11 px-4 button-sm transition-colors duration-300 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-action text-action-text" : "text-text-subtle hover:bg-marker hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="caption-2 text-text-subtle">Prices in USD. Annual saves the dollar amount shown on each plan.</p>
          </div>
      </div>

      <ul className="mt-8 grid border-t-2 border-rule bg-surface md:mt-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
        {plans.map((plan) => {
          const price = priceFor(plan, interval);
          const free = !price;
          const href = `/sign-in?plan=${plan.id}&interval=${price?.interval ?? interval}`;
          return (
            <li
              key={plan.id}
              className={cn(
                "relative grid grid-rows-[auto_auto_auto_auto_1fr] border-b border-border p-6 md:border-r lg:row-span-5 lg:grid-rows-subgrid",
                plan.featured && "bg-surface-raised",
                "max-md:px-0 md:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0",
              )}
            >
              {plan.featured ? <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-marker-bar" /> : null}
              <div className="pb-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="heading-6 text-text">{plan.name}</h3>
                  {plan.featured ? <span className="bg-marker px-2 py-0.5 caption-3 text-marker-ink">Our pick for teams</span> : null}
                </div>
                <p className="body-6 mt-1 text-text-subtle">{plan.tagline}</p>
              </div>
              <div className="pb-6">
                <p className="flex flex-col gap-2">
                  <Fare cents={free ? 0 : price.usd} />
                  <span className="body-6 text-text-subtle">{free ? "free" : `per ${price.interval}`}</span>
                </p>
                {price && price.interval === "year" && yearlySaving(plan) ? (
                  <p className="caption-2 mt-1 text-text-subtle">Saves {money(yearlySaving(plan)!)} a year against monthly.</p>
                ) : null}
                {capgoList[plan.id] ? (
                  <p className="caption-2 mt-1 text-text-subtle">
                    Capgo lists ${capgoList[plan.id]![price?.interval ?? interval]} a month{(price?.interval ?? interval) === "year" ? ", billed yearly" : ""} (checked {capgoCheckedOn}).
                  </p>
                ) : null}
              </div>
              <div className="pb-3">
                <Link href={href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "w-full")}>{plan.cta}</Link>
              </div>
              <p className="caption-2 pb-6 text-text-subtle">{free ? RISK_FREE : RISK_PAID}</p>
              <ul className="flex flex-col border-t border-border">
                {plan.highlights.map((h) => (
                  <li key={h} className="border-b border-border py-2 body-6 text-text last:border-b-0">{h}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 border-b border-rule bg-surface p-6 md:grid-cols-12 md:items-center">
        <div className="md:col-span-4">
          <h3 className="heading-6 text-text">{product.scale.name}</h3>
          <p className="body-6 mt-1 text-text-subtle">{product.scale.tagline}</p>
          <p className="caption-2 mt-1 text-text-subtle">From {money(product.scale.fromUsdMonthly)} a month, sales assisted.</p>
        </div>
        <ul className="flex flex-col gap-1 body-6 text-text md:col-span-5">
          {product.scale.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2"><Check size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-text-accent" /><span>{h}</span></li>
          ))}
        </ul>
        <div className="md:col-span-3 md:justify-self-end">
          <a href={`mailto:${product.supportEmail}?subject=Hotrail%20Scale`} className={buttonClass("secondary", "md")}>Talk to us</a>
        </div>
      </div>
    </div>
  );
}
