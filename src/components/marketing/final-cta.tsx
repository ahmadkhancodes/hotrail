import type { ReactNode } from "react";
import { SessionButtonLink } from "./session-link";
import { Section } from "@/components/ui/layout";

/** Closing call to action: one wide line of type and the one action, on the ink rule. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <Section labelledBy="final-cta-title">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-6">
        <h2 id="final-cta-title" className="heading-3 md:heading-1 text-text lg:col-span-8">{title}</h2>
        <div className="flex flex-col items-start gap-4 lg:col-span-4">
          {body ? <p className="body-3 text-text-subtle">{body}</p> : null}
          <SessionButtonLink href={cta.href} label={cta.label} />
          {note ? <p className="caption-2 text-text-subtle">{note}</p> : null}
        </div>
      </div>
    </Section>
  );
}
