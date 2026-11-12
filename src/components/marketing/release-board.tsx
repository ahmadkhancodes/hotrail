import { cn } from "@/components/ui/cn";

/**
 * The release board: the console's Line view drawn as a working timetable (docs/design-brief.md §4).
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
    <span className={cn("inline-block rounded-sm border border-plate-ink px-1 font-mono caption-3 tracking-widest text-plate-ink", dim ? "bg-surface" : "bg-plate")}>
      {code}
    </span>
  );
}

function Bar({ percent, fromPercent, live }: { percent: number; fromPercent: number; live?: boolean }) {
  return (
    <span className="relative block h-2 w-full bg-surface-sunken" aria-hidden>
      <span
        className={cn("absolute inset-y-0 left-0 w-full origin-left", live ? "rb-bar bg-text" : "bg-border-input")}
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
  return (
    <figure aria-label="Example release board: bundle 2K47 rolling out to 25 percent of production" className="m-0 border border-rule bg-surface">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border bg-surface-sunken px-4 py-2 caption-5 text-text-subtle">
        <span><b className="font-semibold text-text">Ordering</b> <span className="font-mono">com.example.ordering</span></span>
        <span>Example data</span>
      </figcaption>

      {/* Desktop: the timetable. */}
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b border-rule">
            {["Channel", "Bundle", "Rollout", "Devices", "Failures", "Signal"].map((h, i) => (
              <th key={h} scope="col" className={cn("px-4 py-2 caption-3 text-text-subtle", i === 2 && "w-2/5", (i === 3 || i === 4) && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.channel} className={cn("border-b border-border last:border-b-0", i === 0 && "bg-surface")}>
              <th scope="row" className="relative px-4 py-3 text-left align-middle">
                {i === 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-marker" /> : null}
                <span className="block body-5 text-text">{r.channel}</span>
                <span className="block caption-5 text-text-muted">{r.platform}</span>
              </th>
              <td className="px-4 py-3 align-middle">
                <PlateTag code={r.code} />
                {r.from ? <span className="ml-2 caption-5 text-text-muted">after <span className="font-mono">{r.from}</span></span> : null}
              </td>
              <td className="px-4 py-3 align-middle">
                <span className="flex items-center gap-3">
                  <Bar percent={r.percent} fromPercent={r.fromPercent} live={i === 0} />
                  <span className="w-12 shrink-0 text-right font-mono caption-2 tabular-nums text-text">{r.percent}%</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right align-middle font-mono caption-2 tabular-nums text-text">{r.devices}</td>
              <td className="px-4 py-3 text-right align-middle font-mono caption-2 tabular-nums text-text">{r.failures}</td>
              <td className="px-4 py-3 align-middle"><Lamp k={r.lamp} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: one block per channel. */}
      <ul className="m-0 list-none p-0 md:hidden">
        {ROWS.map((r, i) => (
          <li key={r.channel} className="relative flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
            {i === 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-marker" /> : null}
            <span className="flex items-center justify-between gap-3">
              <span className="body-5 text-text">{r.channel} <PlateTag code={r.code} /></span>
              <Lamp k={r.lamp} />
            </span>
            <span className="flex items-center gap-3">
              <Bar percent={r.percent} fromPercent={r.fromPercent} live={i === 0} />
              <span className="w-12 shrink-0 text-right font-mono caption-2 tabular-nums text-text">{r.percent}%</span>
            </span>
            <span className="caption-5 font-mono tabular-nums text-text-muted">{r.devices} devices · {r.failures} failures</span>
          </li>
        ))}
      </ul>

      <div className="grid border-t border-rule md:grid-cols-12">
        <div className="min-w-0 border-b border-border p-4 md:col-span-7 md:border-r md:border-b-0">
          <p className="pb-2 caption-3 text-text-subtle">Departures</p>
          <ol className="m-0 flex list-none flex-col p-0">
            {EVENTS.map((e) => (
              <li key={e.t} className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-border py-2 first:border-t-0">
                <span className="font-mono caption-5 tabular-nums text-text-muted">{e.t}</span>
                <span className="min-w-0 caption-2 text-text">{e.what} <span className="text-text-muted max-md:hidden">· {e.who}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-3 p-4 md:col-span-5">
          <p className="caption-3 text-text-subtle">Bundle <PlateTag code="2K47" /> on production</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 caption-2">
            <dt className="text-text-subtle">Auto pause</dt><dd className="m-0 text-right font-mono tabular-nums text-text">above 2.0%</dd>
            <dt className="text-text-subtle">Signature</dt><dd className="m-0 text-right font-mono text-text">Ed25519 ✓</dd>
            <dt className="text-text-subtle">Native build</dt><dd className="m-0 text-right font-mono text-text">1.9.0 or later</dd>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1" aria-hidden>
            <span className="inline-flex min-h-8 items-center rounded-sm bg-action px-3 button-xsm text-action-text">Raise to 50%</span>
            <span className="inline-flex min-h-8 items-center rounded-sm border border-text px-3 button-xsm text-text">Reverse to 2K46</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
