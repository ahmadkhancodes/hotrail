import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";
import { CompareTable } from "@/components/marketing/compare-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { comparisonBySlug, comparisons } from "@/content/compare";
import { product } from "@/config/product";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/compare/${entry.slug}` },
    openGraph: { title: entry.title, description: entry.description, url: `/compare/${entry.slug}` },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) notFound();

  return (
    <>
      <Section labelledBy="compare-title">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 id="compare-title" className="heading-3 md:heading-2 text-text">{entry.headline}</h1>
          <p className="body-3 text-text-subtle md:title-1">{entry.intro}</p>
          <ButtonLink href="/sign-in" size="lg">Start free</ButtonLink>
        </div>
        <div className="mt-12 md:mt-16">
          <CompareTable
            caption={`${product.name} compared with ${entry.competitor}`}
            columns={[entry.competitor, product.name]}
            highlightColumn={1}
            rows={entry.rows.map((r) => ({ label: r.label, values: [...r.values] }))}
          />
        </div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">{entry.fitNote}</p>
        <p className="caption-2 mt-4 max-w-2xl text-text-subtle">
          Last checked {entry.checkedOn}. Sources:{" "}
          {entry.sources.map((src, i) => (
            <span key={src.href}>{i ? ", " : ""}<a href={src.href} rel="noopener noreferrer" className="underline underline-offset-4 hover:text-text focus-visible:focus-ring">{src.label}</a></span>
          ))}
          . Not affiliated with {entry.competitor}.
        </p>
      </Section>
      <Faq title="Common questions" items={entry.faq} />
      <FinalCta
        title={`Try ${product.name} on one app`}
        body="Run the init command, ship one bundle to a beta channel and watch the train reach a device."
        cta={{ href: "/sign-in", label: "Start free" }}
        note="Free plan, no card."
      />
    </>
  );
}
