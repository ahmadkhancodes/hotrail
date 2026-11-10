/** The signal box mimic panel: channels are tracks, bundles are headcode plates, the lamp is the rollout state. Sample data only. */

function Plate({ x, y, code, run }: { x: number; y: number; code: string; run?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g className={run ? "mm-train" : undefined}>
        <rect className="mm-plate" x={-26} y={-13} width={52} height={26} rx={2} />
        <text className="mm-plate-t" y={6}>{code}</text>
      </g>
    </g>
  );
}

function Track({ y, label, plates }: { y: number; label: string; plates: { x: number; code: string; run?: boolean }[] }) {
  return (
    <g>
      <text className="mm-label" x={20} y={y - 28}>{label}</text>
      <path className="mm-sleeper" d={`M20 ${y}H560`} strokeWidth={10} />
      <path className="mm-rail" d={`M20 ${y - 3}H560M20 ${y + 3}H560M560 ${y - 12}V${y + 12}`} />
      {plates.map((p) => <Plate key={p.code} x={p.x} y={y} code={p.code} run={p.run} />)}
    </g>
  );
}

function Signal({ y }: { y: number }) {
  return (
    <g transform={`translate(604,${y})`}>
      <rect className="mm-post" x={-9} y={-24} width={18} height={50} rx={2} />
      <circle className="mm-lamp-red" cx={0} cy={-13} r={4.5} />
      <circle className="mm-lamp-amber" cx={0} cy={1} r={4.5} />
      <circle className="mm-lamp-green" cx={0} cy={15} r={4.5} />
    </g>
  );
}

export function MimicPanel() {
  return (
    <figure className="m-0 rounded-md border border-border bg-panel p-4 text-panel-ink">
      <figcaption className="flex items-center justify-between gap-4 pb-2 caption-5 text-panel-dim">
        <span><b className="font-bold text-panel-ink">production</b> · com.example.ordering</span>
        <span className="font-mono">Example channel</span>
      </figcaption>
      <svg className="hidden w-full md:block" viewBox="0 0 640 250" role="img" aria-label="Example signal box panel with three tracks: production, beta and staging. Bundle 2K47 moves onto production while the signal turns amber at 25 percent.">
        <Track y={60} label="PRODUCTION" plates={[{ x: 150, code: "2K46" }, { x: 400, code: "2K47", run: true }]} />
        <Track y={140} label="BETA" plates={[{ x: 200, code: "2K47" }]} />
        <Track y={220} label="STAGING" plates={[{ x: 250, code: "2K48" }]} />
        <Signal y={60} />
        <text className="mm-label" x={604} y={100} textAnchor="middle">25%</text>
      </svg>
      <svg className="w-full md:hidden" viewBox="0 0 640 100" role="img" aria-label="Example production track. Bundle 2K47 at a 25 percent rollout, signal amber.">
        <Track y={60} label="PRODUCTION" plates={[{ x: 150, code: "2K46" }, { x: 400, code: "2K47", run: true }]} />
        <Signal y={60} />
      </svg>
      <p className="flex flex-wrap gap-x-6 gap-y-1 pt-3 font-mono caption-5 text-panel-dim">
        <span><span className="text-lamp-green" aria-hidden>●</span> G <b className="font-medium text-panel-ink">12,408</b> on 2K46</span>
        <span><span className="text-lamp-amber" aria-hidden>▲</span> A <b className="font-medium text-panel-ink">4,102</b> on 2K47 (25%)</span>
        <span><span className="text-lamp-red" aria-hidden>■</span> R <b className="font-medium text-panel-ink">0.4%</b> failures</span>
      </p>
    </figure>
  );
}
