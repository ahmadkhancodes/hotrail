import type { Metadata } from "next";
import Link from "next/link";
import { Ledger, Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import {
  CommandChip, Faq, FinalCta, Hero, HowItWorks, PricingTable, ReleaseBoard, TaglineReveal,
  type FaqItem, type Step,
} from "@/components/marketing";
import { capgoCheckedOn } from "@/content/compare";
import { ogImages, twitterImages } from "@/lib/seo";
import { freePlan, product } from "@/config/product";

const TITLE = `${product.fullName}: live updates for Capacitor apps`;
const DESCRIPTION =
  "Push web layer fixes to installed Capacitor apps with rollouts, auto pause and one click rollback. About half the price of Capgo.";
const INIT = "npx @buffersol/hotrail init";
const APPFLOW_SOURCE = "https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", images: ogImages() },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: twitterImages() },
};

const linkClass = "rounded-sm text-text underline decoration-border-input underline-offset-4 transition-colors duration-300 hover:decoration-text max-md:inline-block max-md:min-h-6 focus-visible:focus-ring";

function Terminal({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto border border-border bg-surface-sunken px-4 py-3 font-mono caption-2 text-text" tabIndex={0}>
      <code><span aria-hidden className="text-text-muted">$ </span>{children}</code>
    </pre>
  );
}

const steps: Step[] = [
  { title: "Init", body: "Finds your appId, adds @buffersol/hotrail-updater (coming) and offers migration mode if you use @capgo/capacitor-updater.", visual: <Terminal>{INIT}</Terminal> },
  { title: "Upload", body: "Hashes your files, sends only the new ones, signs the manifest and rejects native files.", visual: <Terminal>npx @buffersol/hotrail upload --dir dist</Terminal> },
  { title: "Release", body: "Point a channel at the bundle at 10 percent and watch it reach devices. The first Applied event is your first update.", visual: <Terminal>npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 10</Terminal> },
];

const incident = [
  { time: "09:12", what: "Bundle 2K47 goes out to everyone." },
  { time: "09:40", what: "Crash reports climb. The fix is ready at 09:55." },
  { time: "Next week", what: "Store review finishes. With Hotrail: 10:05, the fix is on devices." },
];

const benefits = [
  { id: "rollouts", title: "Rollouts that stop themselves", body: "Any percentage from 1 to 100, sticky per device. If failures pass your threshold after the minimum sample, the rollout pauses. Evaluated the moment a device reports a failure.", fragment: <p className="body-6 text-text"><span aria-hidden className="text-lamp-red">■</span> Paused: 4.1% failures on 2K47 at 25%. <span className="text-text-subtle">(Example)</span></p> },
  { id: "reverse", title: "Reverse in one click", body: "The channel points at the previous bundle and the manifest switches in under 10 seconds. A bundle that crashes on boot reverts itself on the next launch.", fragment: <p className="body-6 text-text">Reverse to previous: 2K47 back to 2K46, then the siding. <span className="text-text-subtle">(Example)</span></p> },
  { id: "native", title: "Native safe by default", body: "Every bundle carries a native fingerprint. A device on a native build that lacks a plugin gets no update, not a crash.", fragment: <p className="body-6 text-text">12,408 devices run native build 1.8.0, which lacks @capacitor/camera 8.2. They stay on 2K46 until you ship a store build. <span className="text-text-subtle">(Example)</span></p> },
  { id: "signed", title: "Signed, always", body: "An Ed25519 signed manifest for every bundle, signing on by default, and the plugin rejects a tampered manifest. No third party in your update path.", fragment: <p className="font-mono caption-2 text-text">Signed Ed25519 ✓ <span className="text-text-subtle">(Example)</span></p> },
  { id: "deltas", title: "Deltas, not downloads", body: "Files are content addressed. A second upload of the same build sends under 1% of the bytes.", fragment: <p className="font-mono caption-2 text-text">Sent 0 of 214 files, 0.0 MB <span className="text-text-subtle">(Example)</span></p> },
];

const faq: FaqItem[] = [
  { q: "Is over the air allowed by Apple and Google?", a: "For the web layer, generally yes. Apple Guideline 2.5.2 and the Developer Program License Agreement carve out interpreted JavaScript run by WebKit that does not change the app's primary purpose. Google Play's Device and Network Abuse policy exempts JavaScript in a webview. Native changes still go through the stores, and we block native files at upload. Read the current rules yourself, this is not legal advice." },
  { q: "Can I self host the plugin for free?", a: "The plugin is MIT today (coming with the update API). The Free plan plus export covers most side projects. A self host edge worker is on the roadmap." },
  { q: "Will you be around in two years?", a: `${product.name} is built by ${product.company}.` },
  { q: "Do you have SOC 2?", a: "Not yet. See the security page, the DPA and our penetration test plan." },
  { q: "What happens when I hit my limit?", a: "Your app keeps running its current version. We pause new downloads and ask you to upgrade." },
  { q: "Who owns the account if my agency leaves?", a: "Org transfer and export are v1 features. Today you can export bundles, manifests and events." },
  { q: "Why about half the price?", a: "Our own edge code, object storage with no egress fees, and deltas that send fewer bytes." },
  { q: "What does it not do?", a: "React Native, Flutter, native code changes and store publishing, for now." },
  { q: "Which Capacitor versions?", a: "The Hotrail plugin needs Capacitor 6 or later. In migration mode you keep @capgo/capacitor-updater, so you keep the Capacitor versions it supports." },
  { q: "What do you collect from devices?", a: "A random device ID, app version, OS and platform. No IP address is stored." },
];

export default function HomePage() {
  return (
    <>
      <Hero
        title={<>Fix your Capacitor app{" "}<br className="max-sm:hidden" />today. Not after review.</>}
        subtitle="Live updates with staged rollouts, auto pause and one click rollback. Same core features as Capgo at about half the price. Built for US, Canadian and UK mobile teams by BufferSol Technologies."
        primaryCta={{ href: "/sign-in", label: "Start free" }}
        command={<CommandChip command={INIT} />}
        proof={`Free plan, ${freePlan.limits.mau} MAU, no card.`}
        note={
          <>
            Ionic Appflow access ends <strong className="font-semibold text-text">31 Dec 2027</strong> (<a className={linkClass} rel="noopener noreferrer" href={APPFLOW_SOURCE}>Ionic announcement</a>, checked 3 Nov 2026).
            Already on <code className="font-mono">@capgo/capacitor-updater</code>? <Link className={linkClass} href="/docs/quickstart">Change three URLs.</Link>
          </>
        }
        visual={<ReleaseBoard />}
      />

      <Section labelledBy="incident-title" rhythm="md">
        <Ledger
          head={
            <>
              <h2 id="incident-title" className="heading-4 md:heading-3 text-text">A broken bundle should not cost you three days.</h2>
              <p className="body-3 text-text-subtle">You shipped a JS or CSS change. It crashes on launch for some users. The fix is one line and the store review queue is 1 to 3 days. Meanwhile the one star reviews arrive.</p>
            </>
          }
        >
          <table className="w-full border-collapse text-left">
            <caption className="caption-5 pb-2 text-left text-text-muted">Illustration, not a customer story</caption>
            <thead><tr className="border-b border-rule"><th scope="col" className="w-40 py-2 pr-4 caption-3 text-text-subtle">Time</th><th scope="col" className="py-2 caption-3 text-text-subtle">What happened</th></tr></thead>
            <tbody>
              {incident.map((r, i) => (
                <tr key={r.time} className="border-b border-border">
                  <th scope="row" className="py-4 pr-4 align-top heading-5 tabular-nums text-text-accent">{r.time}</th>
                  <td className="py-4 body-3 text-text">{i === incident.length - 1 ? <><span className="text-text-subtle">{r.what.split(" With Hotrail")[0]}</span> <mark className="bg-marker px-1 text-marker-ink">With Hotrail{r.what.split(" With Hotrail")[1]}</mark></> : r.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Ledger>
      </Section>

      <TaglineReveal text="Ship the web layer straight to installed apps. Roll it out slowly. Pause it automatically. Reverse it in one click." />

      <Section tone="raised" labelledBy="benefits-title">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-span-4 lg:self-start lg:pr-8">
            <h2 id="benefits-title" className="heading-4 md:heading-3 text-text">Built for the bad day</h2>
            <p className="body-3 text-text-subtle">Five things that decide whether a bad release is a shrug or a weekend.</p>
          </div>
          <ul className="m-0 flex list-none flex-col p-0 lg:col-span-8">
            {benefits.map((b) => (
              <li key={b.id} id={b.id} className="grid gap-4 border-t border-border-strong py-8 first:border-t-0 first:pt-0 md:grid-cols-2 md:gap-6 lg:scroll-mt-24">
                <div className="flex flex-col gap-2">
                  <h3 className="heading-6 text-text">{b.title}</h3>
                  <p className="body-6 text-text-subtle">{b.body}</p>
                </div>
                <div className="self-start border border-border bg-surface px-4 py-3">{b.fragment}</div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <HowItWorks
        title="Three commands from build to device"
        intro="Run them locally first, then paste the same lines into CI."
        steps={steps}
      />

      <Section labelledBy="migration-title" rhythm="md">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col items-start gap-4 lg:col-span-5">
            <h2 id="migration-title" className="heading-5 md:heading-4 text-text">Already on @capgo/capacitor-updater? Change three URLs.</h2>
            <p className="body-3 text-text-subtle">Point updateUrl, statsUrl and channelUrl at Hotrail. Swap the plugin at your next store build.</p>
            <ButtonLink href="/docs/quickstart" variant="secondary">Read the migration guide</ButtonLink>
          </div>
          <div className="flex flex-col gap-4 lg:col-span-6 lg:col-start-7">
            <h2 className="heading-6 text-text">Coming from Ionic Appflow?</h2>
            <p className="body-6 text-text-subtle">Access ends 31 Dec 2027 (<a className={linkClass} rel="noopener noreferrer" href={APPFLOW_SOURCE}>Ionic announcement</a>). Import guide coming.</p>
            <h2 id="compliance-title" className="heading-6 pt-4 text-text">Web layer only.</h2>
            <p className="body-6 text-text-subtle">Native changes still go through the stores, and we block native files at upload. Apple Guideline 2.5.2 and the Developer Program License Agreement, and Google Play&apos;s policy on JavaScript in a webview, are the rules to read. Compliance guide: coming. We never claim Apple approved this.</p>
          </div>
        </div>
      </Section>

      <Section tone="raised" labelledBy="pricing-title">
        <PricingTable title="Half the fare. Same line." />
        <p className="body-6 mt-8 max-w-2xl text-text-subtle">No bandwidth meter. No seats. Hit your limit and your app keeps running; we pause new downloads and ask. Capgo list prices checked {capgoCheckedOn}. Build minutes ship in v1.</p>
      </Section>

      <Section labelledBy="trust-title" rhythm="md">
        <Ledger head={<h2 id="trust-title" className="heading-4 md:heading-3 text-text">Security in plain facts</h2>}>
          <ul className="m-0 grid list-none gap-x-6 p-0 md:grid-cols-2">
            {[
              "Signing on by default",
              "Audit log on every plan",
              "Org roles with scoped API keys",
              "An MIT plugin you can read (coming)",
              "Export of bundles, manifests and events",
              "No third party in the delivery path",
            ].map((t) => <li key={t} className="border-b border-border py-3 body-5 text-text">{t}</li>)}
            <li className="py-3 body-6 text-text-subtle md:col-span-2">SOC 2: not yet. See the <Link className={linkClass} href="/legal/security">security page</Link>, the <Link className={linkClass} href="/legal/dpa">DPA</Link> and our pen test plan.</li>
          </ul>
        </Ledger>
      </Section>

      <Section tone="raised" labelledBy="agents-title" rhythm="sm">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-6">
          <div className="flex flex-col gap-3 lg:col-span-5">
            <h2 id="agents-title" className="heading-5 md:heading-4 text-text">Built for agents and CI</h2>
            <p className="body-6 text-text-subtle">Run the CLI in GitHub Actions or GitLab CI. An MCP server (upload, release, rollback, stats) is coming; an agent release needs your explicit confirmation, and there is no LLM on our side. <Link className={linkClass} href="/llms.txt">llms.txt</Link> is live. <Link href="/docs/quickstart" className={linkClass}>See the CI recipes</Link>.</p>
          </div>
          <div className="min-w-0 lg:col-span-7"><Terminal>npx @buffersol/hotrail release --channel production --percent 10</Terminal></div>
        </div>
      </Section>

      <Faq items={faq} />
      <FinalCta
        title="Your next hotfix should take minutes."
        body={<>Start on the Free plan, then run <code className="font-mono">{INIT}</code>.</>}
        cta={{ href: "/sign-in", label: "Start free" }}
        note="Free plan, no card."
      />
    </>
  );
}
