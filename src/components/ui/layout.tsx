import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Marketing section (docs/design-brief.md §4). Each section opens with a 2px cobalt rule like a printed timetable.
 * `rhythm` varies the vertical padding on purpose so the page does not repeat one block height.
 */
export function Section({ id, tone = "base", rhythm = "lg", rule = true, className, children, labelledBy }: { id?: string; tone?: "base" | "raised" | "inverse"; rhythm?: "sm" | "md" | "lg"; rule?: boolean; className?: string; children: ReactNode; labelledBy?: string }) {
  const t = { base: "bg-surface", raised: "bg-surface-raised", inverse: "bg-surface-inverse text-text-inverse" }[tone];
  const r = { sm: "py-12", md: "py-12 md:py-16", lg: "py-12 md:py-24" }[rhythm];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(t, className)}>
      <Container>
        <div className={cn(r, rule && "border-t-2 border-rule")}>{children}</div>
      </Container>
    </section>
  );
}

/** Ledger layout: a label column (section head) and a content column, top aligned. */
export function Ledger({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-8 lg:grid-cols-12 lg:gap-6", className)}>
      <div className="flex flex-col gap-4 lg:col-span-4 lg:pr-8">{head}</div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </div>
  );
}
