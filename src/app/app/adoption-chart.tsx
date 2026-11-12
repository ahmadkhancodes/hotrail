"use client";
import { useEffect, useState } from "react";
import type { UsageSeries } from "@/lib/ship/usage";

// One ink family; series are told apart by dash pattern and the end label, never by hue alone (state colours stay for state).
const COLORS = ["var(--text)", "var(--text-muted)", "var(--text-subtle)", "var(--border-input)"];
const DASH = [undefined, "6 3", "2 3", "10 3 2 3"];
const W = 640;
const H = 180;
const PAD = { l: 40, r: 56, t: 8, b: 22 };

/** Adoption per bundle: cumulative devices that applied each version over the last 24 h, from the 5 minute buckets. */
export function AdoptionChart({ bundleId }: { bundleId: string }) {
  const [data, setData] = useState<UsageSeries | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/v1/usage?appId=${encodeURIComponent(bundleId)}&hours=24`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<UsageSeries>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [bundleId]);

  const series = (data?.versions ?? []).slice(0, 4);
  const max = Math.max(1, ...series.map((s) => s.cumulative.at(-1) ?? 0));
  const n = data?.points.length ?? 1;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const hh = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

  return (
    <section aria-labelledby="adopt-h" data-testid="adoption-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 id="adopt-h" className="title-4 text-text-subtle">Adoption, last 24 h</h2>
        {data ? <span className="font-mono caption-5 text-text-subtle">{data.totals.applied.toLocaleString("en")} applied · {(data.totals.failed + data.totals.rolledBack).toLocaleString("en")} failed or reversed · 5 min buckets</span> : null}
      </div>
      {failed && !data ? (
        <p className="m-0 rounded-sm border border-border p-3 body-6 text-text-subtle">The adoption chart did not load. The line above is not affected.</p>
      ) : !data ? (
        <div className="h-44 animate-pulse rounded-sm bg-surface-sunken" aria-busy="true" aria-label="Loading adoption" />
      ) : series.length === 0 ? (
        <p className="m-0 rounded-sm border border-border p-3 body-6 text-text-subtle">No device has applied a bundle in the last 24 hours. Devices appear here as they report in.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
            aria-label={`Adoption by bundle over the last 24 hours. ${series.map((s) => `${s.headcode ?? s.version}: ${s.cumulative.at(-1)} devices`).join(", ")}.`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--text-subtle)" className="font-mono">{Math.round(max * f)}</text>
              </g>
            ))}
            {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--text-subtle)" className="font-mono">{data ? hh(data.points[i]!.t) : ""}</text>
            ))}
            {series.map((s, k) => (
              <g key={s.version}>
                <polyline fill="none" stroke={COLORS[k]} strokeWidth={2} strokeDasharray={DASH[k]} strokeLinejoin="round"
                  points={s.cumulative.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
                <text x={W - PAD.r + 6} y={y(s.cumulative.at(-1) ?? 0) + 4} fontSize={12} fill="var(--text)" className="font-mono">{s.headcode ?? s.version}</text>
              </g>
            ))}
          </svg>
          <div className="sr-only"><table>
            <caption>Devices that applied each bundle in the last 24 hours</caption>
            <tbody>{series.map((s) => <tr key={s.version}><th scope="row">{s.headcode ?? s.version}</th><td>{s.cumulative.at(-1)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </section>
  );
}
