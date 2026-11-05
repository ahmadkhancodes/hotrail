import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
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
  /** The product itself: the mimic panel. */
  visual: ReactNode;
}

/** Left-aligned hero: claim, one action with its command beside it, a sourced proof note, and the live panel. */
export function Hero({ title, subtitle, primaryCta, secondaryCta, command, proof, note, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface-raised pb-12 pt-12 md:pb-24 md:pt-20">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-12">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-5">
            <h1 id="hero-title" className="heading-3 md:heading-2 text-text">{title}</h1>
            <p className="body-3 max-w-xl text-text-subtle">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {command}
            </div>
            <p className="caption-2 text-text-subtle">
              {proof}
              {secondaryCta ? (
                <> <Link href={secondaryCta.href} className="rounded-sm underline underline-offset-4 hover:text-text focus-visible:focus-ring">{secondaryCta.label}</Link></>
              ) : null}
            </p>
            {note ? <div className="rounded-sm border border-border bg-surface-sunken p-4 body-6 text-text">{note}</div> : null}
          </div>
          <div className="min-w-0 lg:col-span-7">{visual}</div>
        </div>
      </Container>
    </section>
  );
}
