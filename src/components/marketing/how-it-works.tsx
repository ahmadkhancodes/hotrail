import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";

export interface Step {
  title: string;
  body: ReactNode;
  /** The command or UI fragment for this step, not an icon. */
  visual: ReactNode;
}

/** Steps as ruled timetable rows: the command is the row's anchor, the explanation sits beside it. */
export function HowItWorks({ title, intro, steps }: { title: ReactNode; intro?: ReactNode; steps: Step[] }) {
  return (
    <Section labelledBy="how-title" rhythm="md">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-span-4 lg:pr-8">
          <h2 id="how-title" className="heading-4 md:heading-3 text-text">{title}</h2>
          {intro ? <p className="body-3 text-text-subtle">{intro}</p> : null}
        </div>
        <ol className="m-0 flex list-none flex-col p-0 lg:col-span-8">
          {steps.map((step, i) => (
            <li key={step.title} className="grid gap-3 border-t border-border py-6 first:border-t-0 first:pt-0 md:grid-cols-8 md:gap-6">
              <h3 className="title-2 text-text md:col-span-2"><span className="sr-only">Step {i + 1}: </span>{step.title}</h3>
              <div className="flex min-w-0 flex-col gap-3 md:col-span-6">
                {step.visual}
                <p className="body-6 text-text-subtle">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
