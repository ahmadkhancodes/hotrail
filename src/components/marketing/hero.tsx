import type { ReactNode } from "react";
import Link from "next/link";
import { SessionButtonLink } from "./session-link";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Command chip next to the CTA (copy button). */
  command?: ReactNode;
  proof?: ReactNode;
  /** Dated, sourced note under the claim. */
  note?: ReactNode;
  /** The product itself: the release board. */
  visual: ReactNode;
}

/**
 * Timetable hero (docs/design-brief.md §4): a wide, left-aligned claim across the grid, then an offset
 * block with the subtitle and the single action, then the product at full container width.
 */
export function Hero({ title, subtitle, primaryCta, secondaryCta, command, proof, note, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface">
      <Container className="pb-12 pt-10 md:pb-20 md:pt-12">
        <h1 id="hero-title" className="heading-3 md:heading-1 max-w-5xl text-text">{title}</h1>
        <div className="mt-8 grid gap-8 md:mt-10 lg:grid-cols-12 lg:gap-6">
          <p className="body-3 text-text-subtle lg:col-span-5">{subtitle}</p>
          <div className="flex min-w-0 flex-col items-start gap-4 lg:col-span-6 lg:col-start-7">
            <div className="flex w-full flex-wrap items-center gap-3">
              <SessionButtonLink href={primaryCta.href} label={primaryCta.label} />
              {command}
            </div>
            <p className="caption-2 text-text-subtle">
              {proof}
              {secondaryCta ? (
                <> <Link href={secondaryCta.href} className="rounded-sm text-text underline underline-offset-4 max-md:inline-block max-md:min-h-6 focus-visible:focus-ring">{secondaryCta.label}</Link></>
              ) : null}
            </p>
            {note ? <div className="caption-2 text-text-subtle">{note}</div> : null}
          </div>
        </div>
        <div className="mt-10 min-w-0 md:mt-12">{visual}</div>
      </Container>
    </section>
  );
}
