import { cn } from "@/components/ui/cn";

/**
 * The release board: the console's Line view drawn as a departure board (docs/design-brief.md §4).
 * Example data only, and labelled as such. Same tokens as the console (plate, lamps, rules).
 */

type LampKey = "green" | "amber" | "red";
const LAMP: Record<LampKey, { glyph: string; letter: string; word: string; cls: string }> = {
  green: { glyph: "●", letter: "G", word: "Live", cls: "text-lamp-green" },
  amber: { glyph: "▲", letter: "A", word: "Rolling out", cls: "text-lamp-amber" },
  red: { glyph: "■", letter: "R", word: "Paused", cls: "text-lamp-red" },
};

interface Row { channel: string; platform: string; code: string; from?: string; percent: number; fromPercent: number; devices: string; failures: string; lamp: LampKey }

const ROWS: Row[] = [
  { channel: "production", platform: "iOS + Android", code: "2K47", from: "2K46", percent: 25, fromPercent: 10, devices: "4,102", failures: "0.4%", lamp: "amber" },
  { channel: "beta", platform: "iOS + Android", code: "2K47", percent: 100, fromPercent: 100, devices: "318", failures: "0.0%", lamp: "green" },
  { channel: "staging", platform: "Android", code: "2K48", percent: 100, fromPercent: 100, devices: "12", failures: "0.0%", lamp: "green" },
];

const EVENTS = [
  { t: "09:58:12", what: "2K47 raised to 25% on production", who: "dana@example.com" },
  { t: "09:41:03", what: "2K47 released at 10% on production", who: "CLI, key ci-upload" },
  { t: "09:40:47", what: "2K47 uploaded, 3 of 214 files new (41 kB)", who: "CLI, key ci-upload" },
  { t: "09:12:30", what: "2K46 reached 12,408 devices", who: "Hotrail" },
];

function PlateTag({ code, dim }: { code: string; dim?: boolean }) {
  return (
    <span className={cn("inline-block w-fit rounded-sm px-1 font-mono caption-3 tracking-widest", dim ? "border border-plate bg-surface text-text-accent" : "bg-plate text-plate-ink")}>
      {code}
    </span>
  );
}

function Bar({ percent, fromPercent, live }: { percent: number; fromPercent: number; live?: boolean }) {
  return (
    <span className="relative block h-2 w-full bg-surface-sunken" aria-hidden>
      <span
        className={cn("absolute inset-y-0 left-0 w-full origin-left", live ? "rb-bar bg-action" : "bg-border-input")}
        style={{ transform: `scaleX(${percent / 100})`, ["--rb-from" as string]: String(fromPercent / 100) }}
      />
    </span>
  );
}

function Lamp({ k }: { k: LampKey }) {
  const l = LAMP[k];
  return (
    <span className="whitespace-nowrap caption-4 text-text">
      <span aria-hidden className={l.cls}>{l.glyph}</span> {l.word}
    </span>
  );
}

export function ReleaseBoard() {
  const live = ROWS[0]!;
  return (
    <figure aria-label="Example release board: bundle 2K47 rolling out to 25 percent of production" className="m-0 border border-rule bg-surface">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-action px-4 py-2 caption-5 text-action-text">
        <span><b className="font-semibold">Departures</b> · Ordering <span className="font-mono">com.example.ordering</span></span>
        <span>Example data</span>
      </figcaption>

      <div className="grid md:grid-cols-12">
        {/* The train that is moving now: the percentage is the anchor. */}
        <div className="relative flex min-w-0 flex-col gap-4 border-b border-border p-4 md:col-span-5 md:border-r md:border-b-0 md:p-6">
          <p className="caption-3 text-text-subtle">Now rolling out on <span className="text-text">{live.channel}</span></p>
          <p className="flex items-end gap-4">
            <span className="numeral-2 md:numeral-1 text-text-accent">{live.percent}<span className="numeral-3 align-top">%</span></span>
            <span className="flex flex-col gap-1 pb-1">
              <PlateTag code={live.code} />
              <span className="caption-5 text-text-muted">after <span className="font-mono">{live.from}</span></span>
            </span>
          </p>
          <Bar percent={live.percent} fromPercent={live.fromPercent} live />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 caption-2">
            <dt className="text-text-subtle">Devices</dt><dd className="m-0 text-right font-mono tabular-nums text-text">{live.devices}</dd>
            <dt className="text-text-subtle">Failures</dt><dd className="m-0 text-right font-mono tabular-nums text-text">{live.failures}</dd>
            <dt className="text-text-subtle">Auto pause</dt><dd className="m-0 text-right font-mono tabular-nums text-text">above 2.0%</dd>
            <dt className="text-text-subtle">Signature</dt><dd className="m-0 text-right font-mono text-text">Ed25519 ✓</dd>
            <dt className="text-text-subtle">Native build</dt><dd className="m-0 text-right font-mono text-text">1.9.0 or later</dd>
          </dl>
          <div className="flex flex-wrap gap-2" aria-hidden>
            <span className="inline-flex min-h-8 items-center rounded-sm bg-action px-3 button-xsm text-action-text">Raise to 50%</span>
            <span className="inline-flex min-h-8 items-center rounded-sm border border-action px-3 button-xsm text-text-accent">Reverse to 2K46</span>
          </div>
        </div>

        <div className="min-w-0 md:col-span-7">
          {/* Desktop: the timetable. */}
          <table className="hidden w-full border-collapse text-left md:table">
            <thead>
              <tr className="border-b border-rule">
                {["Channel", "Bundle", "Rollout", "Devices", "Signal"].map((h, i) => (
                  <th key={h} scope="col" className={cn("px-4 py-2 caption-3 text-text-subtle", (i === 2 || i === 3) && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={r.channel} className={cn("border-b border-border", i === 0 && "bg-marker")}>
                  <th scope="row" className="relative px-4 py-3 text-left align-middle">
                    <span className="block body-5 text-text">{r.channel}</span>
                    <span className="block caption-5 text-text-muted">{r.platform}</span>
                  </th>
                  <td className="px-4 py-3 align-middle"><PlateTag code={r.code} /></td>
                  <td className="px-4 py-3 text-right align-middle"><span className="heading-4 tabular-nums text-text">{r.percent}%</span></td>
                  <td className="px-4 py-3 text-right align-middle font-mono caption-2 tabular-nums text-text">{r.devices}</td>
                  <td className="px-4 py-3 align-middle"><Lamp k={r.lamp} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phone: one line per channel. */}
          <ul className="m-0 list-none p-0 md:hidden">
            {ROWS.map((r, i) => (
              <li key={r.channel} className={cn("relative flex items-center justify-between gap-3 border-b border-border px-4 py-3", i === 0 && "bg-marker")}>
                <span className="flex flex-col gap-1">
                  <span className="body-5 text-text">{r.channel} <PlateTag code={r.code} /></span>
                  <Lamp k={r.lamp} />
                </span>
                <span className="heading-4 tabular-nums text-text">{r.percent}%</span>
              </li>
            ))}
          </ul>

          <div className="p-4">
            <p className="pb-2 caption-3 text-text-subtle">Log</p>
            <ol className="m-0 flex list-none flex-col p-0">
              {EVENTS.map((e) => (
                <li key={e.t} className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-border py-2 first:border-t-0">
                  <span className="font-mono caption-5 tabular-nums text-text-muted">{e.t}</span>
                  <span className="min-w-0 caption-2 text-text">{e.what} <span className="text-text-muted max-md:hidden">· {e.who}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </figure>
  );
}
