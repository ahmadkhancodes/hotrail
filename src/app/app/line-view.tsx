"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Notice, Skeleton } from "@/components/ui/states";
import type { Lamp, LineBundle, LineChannel, LineView as LineData } from "@/lib/ship/line";

const POLL_MS = 5000;
const STEPS = [1, 5, 10, 25, 50, 100];
const nextStep = (p: number) => STEPS.find((s) => s > p) ?? 100;

const ERRORS: Record<string, string> = {
  channel_busy: "Another release changed this channel at the same moment. Check the line and try again.",
  no_previous_bundle: "This channel has no earlier bundle to reverse to.",
  insufficient_scope: "This key or role cannot change releases.",
  forbidden: "Your role does not allow releasing. Ask an owner or admin.",
  bundle_not_found: "That bundle no longer exists.",
};

const LAMP: Record<Lamp, { glyph: string; letter: string; word: string; cls: string }> = {
  green: { glyph: "●", letter: "G", word: "Live", cls: "text-lamp-green" },
  amber: { glyph: "▲", letter: "A", word: "Rolling out", cls: "text-lamp-amber" },
  red: { glyph: "■", letter: "R", word: "Paused", cls: "text-lamp-red" },
  idle: { glyph: "○", letter: "-", word: "No bundle", cls: "text-panel-dim" },
};

export function Plate({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-block rounded-sm border border-plate-ink bg-plate px-2 font-display text-lg leading-5 font-semibold tracking-[0.08em] text-plate-ink", className)}>
      {code}
    </span>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour12: false });
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

function TrackSvg({ ch }: { ch: LineChannel }) {
  const on = (l: Lamp) => ({ opacity: ch.lamp === l ? 1 : 0.18 });
  return (
    <svg viewBox="0 0 480 56" className="block h-14 w-full" role="img" aria-label={`${ch.name} track: ${ch.headcode ?? "no bundle"}, ${LAMP[ch.lamp].word.toLowerCase()}${ch.headcode ? ` at ${ch.percent} percent` : ""}`}>
      <path className="mm-sleeper" d="M8 28H400" strokeWidth={10} />
      <path className="mm-rail" d="M8 25H400M8 31H400M400 16V40" />
      {ch.previousHeadcode ? (
        <g transform="translate(104,28)" opacity={0.55}>
          <rect className="mm-plate" x={-26} y={-13} width={52} height={26} rx={2} />
          <text className="mm-plate-t" y={6}>{ch.previousHeadcode}</text>
        </g>
      ) : null}
      {ch.headcode ? (
        <g transform="translate(264,28)">
          <rect className="mm-plate" x={-26} y={-13} width={52} height={26} rx={2} />
          <text className="mm-plate-t" y={6}>{ch.headcode}</text>
        </g>
      ) : null}
      <g transform="translate(446,28)">
        <rect className="mm-post" x={-9} y={-24} width={18} height={50} rx={2} />
        <circle cx={0} cy={-13} r={4.5} fill="var(--lamp-red)" style={on("red")} />
        <circle cx={0} cy={1} r={4.5} fill="var(--lamp-amber)" style={on("amber")} />
        <circle cx={0} cy={15} r={4.5} fill="var(--lamp-green)" style={on("green")} />
      </g>
    </svg>
  );
}

function Tracks({ channels, selected, onSelect }: { channels: LineChannel[]; selected: string | null; onSelect: (c: LineChannel) => void }) {
  return (
    <ul aria-label="Channels" className="m-0 list-none rounded-md bg-panel p-2 text-panel-ink md:px-3">
      {channels.map((c, i) => {
        const l = LAMP[c.lamp];
        return (
          <li key={c.id} style={i > 0 ? { borderTop: "1px solid color-mix(in srgb, var(--panel-dim) 30%, transparent)" } : undefined}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              aria-pressed={selected === c.id}
              className={cn(
                "grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-sm px-2 py-2 text-left md:min-h-[76px] md:grid-cols-[104px_1fr_168px] md:py-0",
                "focus-visible:focus-ring hover:bg-white/5 aria-pressed:bg-white/5 aria-pressed:outline-2 aria-pressed:-outline-offset-2 aria-pressed:outline-focus",
              )}
            >
              <span className="font-mono text-xs leading-4 text-panel-dim">
                <b className="block font-medium text-panel-ink">{c.name}</b>
                {c.platform === "all" ? "iOS + Android" : c.platform === "ios" ? "iOS" : "Android"}
              </span>
              <span className="hidden md:block"><TrackSvg ch={c} /></span>
              <span className="text-right font-mono text-xs leading-4 text-panel-dim">
                <b className="block text-sm leading-5 font-medium text-panel-ink md:hidden">
                  {c.headcode ? <Plate code={c.headcode} className="mr-2 align-middle" /> : null}
                </b>
                <span className={l.cls} aria-hidden>{l.glyph}</span> {l.letter} {l.word}{c.headcode ? ` · ${c.percent}%` : ""}
                <br />{c.devices.toLocaleString("en")} devices
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Inspector({
  data, bundle, canWrite, onChanged,
}: { data: LineData; bundle: LineBundle | null; canWrite: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const live = bundle ? data.channels.filter((c) => c.headcode === bundle.headcode) : [];
  const ch = live[0] ?? null;
  const target = ch ?? data.channels.find((c) => c.name === "production") ?? data.channels[0] ?? null;

  async function act(label: string, path: string, body: Record<string, unknown>) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ appId: data.app.bundleId, ...body }), credentials: "same-origin" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERRORS[j.error ?? ""] ?? "That did not go through. Check the line and try again.");
      } else onChanged();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  }

  if (!bundle) {
    return <aside aria-label="Bundle detail" className="rounded-md border border-border bg-surface p-4 body-6 text-text-subtle">Select a channel or a bundle to see its rollout.</aside>;
  }
  const l = ch ? LAMP[ch.lamp] : null;
  return (
    <aside aria-label={`Bundle ${bundle.headcode} detail`} className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4 shadow-[-8px_0_24px_rgba(15,27,45,.08)]">
      <h3 className="flex items-center gap-3 heading-5 text-text"><Plate code={bundle.headcode} /> {ch ? "Rollout" : "Bundle"}</h3>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 body-6">
        <dt className="text-text-subtle">Channel</dt><dd className="m-0 text-right">{ch ? ch.name : "not live"}</dd>
        <dt className="text-text-subtle">Version</dt><dd className="m-0 text-right font-mono">{bundle.version}</dd>
        <dt className="text-text-subtle">Native build</dt><dd className="m-0 text-right font-mono">{bundle.nativeFingerprint.slice(0, 12)}</dd>
        <dt className="text-text-subtle">Signed</dt><dd className="m-0 text-right">{bundle.signed ? "Ed25519 ✓" : "Unsigned"}</dd>
        <dt className="text-text-subtle">Size</dt><dd className="m-0 text-right font-mono">{bytes(bundle.sizeBytes)}</dd>
        {ch ? <><dt className="text-text-subtle">Auto pause at</dt><dd className="m-0 text-right font-mono">{(ch.autopauseThreshold * 100).toFixed(1)}% failures</dd></> : null}
      </dl>
      {ch && l ? (
        <div>
          <div><span className={l.cls} aria-hidden>{l.glyph}</span> {l.letter} {l.word} · <span className="font-mono">{ch.percent}%</span></div>
          <div className="my-2 h-2 rounded-sm border border-border bg-surface-sunken" role="progressbar" aria-label="Rollout" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ch.percent}>
            <div className="h-full bg-lamp-amber" style={{ width: `${ch.percent}%` }} />
          </div>
        </div>
      ) : null}
      {ch?.paused ? (
        <div role="alert" className="rounded-sm border border-lamp-red p-3 body-6">
          <b className="text-lamp-red">■ R</b> {ch.pausedReason === "manual" ? "Paused by hand." : ch.pausedReason ?? "Paused."} Devices keep what they have and get nothing new until you resume or reverse.
        </div>
      ) : null}
      {error ? <div role="alert" className="rounded-sm border border-lamp-red p-3 body-6 text-text">{error}</div> : null}
      {!canWrite ? (
        <p className="body-6 text-text-subtle">Your role is read only. Owners, admins and members can release.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ch && !ch.paused && ch.percent < 100 ? (
            <Button loading={busy === "raise"} disabled={busy !== null} onClick={() => act("raise", "/api/v1/channels/release", { channel: ch.name, bundle: bundle.headcode, percent: nextStep(ch.percent) })}>
              Raise to {nextStep(ch.percent)}%
            </Button>
          ) : null}
          {ch?.paused ? <Button loading={busy === "resume"} disabled={busy !== null} onClick={() => act("resume", "/api/v1/channels/resume", { channel: ch.name })}>Resume</Button> : null}
          {ch && !ch.paused ? <Button variant="secondary" loading={busy === "pause"} disabled={busy !== null} onClick={() => act("pause", "/api/v1/channels/pause", { channel: ch.name })}>Pause rollout</Button> : null}
          {!ch && target ? (
            <Button loading={busy === "release"} disabled={busy !== null} onClick={() => act("release", "/api/v1/channels/release", { channel: target.name, bundle: bundle.headcode, percent: 10 })}>
              Release to {target.name} at 10%
            </Button>
          ) : null}
          {ch ? (
            <Button variant="secondary" disabled={busy !== null || !ch.previousHeadcode} onClick={() => setConfirm(true)}>
              {ch.previousHeadcode ? `Reverse to ${ch.previousHeadcode}` : "Reverse to previous"}
            </Button>
          ) : null}
        </div>
      )}
      {ch ? (
        <ConfirmDialog
          open={confirm} title={`Reverse ${ch.name} to ${ch.previousHeadcode}?`} confirmLabel="Reverse" busy={busy === "rollback"} error={error}
          onConfirm={() => act("rollback", "/api/v1/channels/rollback", { channel: ch.name })} onClose={() => setConfirm(false)}
        >
          {ch.previousHeadcode} goes live to 100% of devices on {ch.name}. Devices on {bundle.headcode} get it on their next check. This is recorded in the audit log.
        </ConfirmDialog>
      ) : null}
    </aside>
  );
}

function BundlesTable({ bundles, selected, onSelect }: { bundles: LineBundle[]; selected: string | null; onSelect: (b: LineBundle) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left body-6 tabular-nums">
        <caption className="sr-only">Bundles, newest first</caption>
        <thead>
          <tr className="border-b border-border caption-5 text-text-subtle">
            <th scope="col" className="p-2 font-bold">Headcode</th>
            <th scope="col" className="p-2 font-bold">Version</th>
            <th scope="col" className="hidden p-2 font-bold sm:table-cell">Native build</th>
            <th scope="col" className="p-2 text-right font-bold">Adoption</th>
            <th scope="col" className="p-2 text-right font-bold">Failures</th>
            <th scope="col" className="hidden p-2 text-right font-bold md:table-cell">Delta sent</th>
          </tr>
        </thead>
        <tbody>
          {bundles.map((b) => (
            <tr key={b.id} aria-selected={selected === b.id} className="h-11 border-b border-border aria-selected:bg-surface-raised md:h-8">
              <td className="p-0">
                <button type="button" onClick={() => onSelect(b)} className="flex min-h-11 cursor-pointer items-center gap-2 px-2 focus-visible:focus-ring md:min-h-8" aria-label={`Select bundle ${b.headcode}`}>
                  <Plate code={b.headcode} />
                  {b.channels.length ? <span className="caption-5 text-text-subtle">{b.channels.join(", ")}</span> : null}
                </button>
              </td>
              <td className="px-2 font-mono">{b.version}</td>
              <td className="hidden px-2 font-mono sm:table-cell">{b.nativeFingerprint.slice(0, 12)}</td>
              <td className="px-2 text-right font-mono">{pct(b.adoption)}</td>
              <td className={cn("px-2 text-right font-mono", b.failureRate > 0.02 && "text-lamp-red")}>{pct(b.failureRate)}</td>
              <td className="hidden px-2 text-right font-mono md:table-cell">{pct(b.uploadRatio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LineSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the line" className="flex flex-col gap-4">
      <Skeleton className="h-60 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-2/3" />
    </div>
  );
}

export function LineView({ bundleId, initial, canWrite }: { bundleId: string; initial: LineData | null; canWrite: boolean }) {
  const [data, setData] = useState<LineData | null>(initial);
  const [error, setError] = useState<string | null>(initial ? null : "We could not load this line.");
  const [loading, setLoading] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/line?appId=${encodeURIComponent(bundleId)}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as LineData;
      if (alive.current) { setData(next); setError(null); }
    } catch {
      if (alive.current) setError("Lost contact with the server.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    alive.current = true;
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  const bundle = useMemo(() => {
    if (!data) return null;
    const byId = data.bundles.find((b) => b.id === selectedBundle);
    if (byId) return byId;
    const ch = data.channels.find((c) => c.id === selectedChannel) ?? data.channels.find((c) => c.headcode);
    return (ch && data.bundles.find((b) => b.headcode === ch.headcode)) ?? data.bundles[0] ?? null;
  }, [data, selectedBundle, selectedChannel]);

  if (!data) {
    if (loading) return <LineSkeleton />;
    return (
      <ErrorState
        title="The line did not load"
        body="We could not read this app's channels. Your devices are not affected, they keep getting updates from the last published state."
        action={<Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>Try again</Button>}
      />
    );
  }
  if (data.bundles.length === 0) {
    const cmd = "npx @buffersol/hotrail upload";
    return (
      <EmptyState
        title="No trains on this line yet."
        body={<>Build your web app, then upload it. Your first bundle appears here with a headcode, ready to release to <b>production</b>.<br /><code className="mt-2 inline-block">{cmd}</code></>}
        action={<CopyButton value={cmd} label="Copy command" />}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice tone="warning" title={error}>Showing the last update from {time(data.generatedAt)}. Retrying every few seconds.</Notice> : null}
      <p className="m-0 caption-5 text-text-subtle" aria-live="off">
        <span className="text-lamp-green" aria-hidden>●</span> Live, updated {time(data.generatedAt)} · {data.totals.devices.toLocaleString("en")} devices seen in 30 days
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Tracks channels={data.channels} selected={bundle ? data.channels.find((c) => c.headcode === bundle.headcode && (selectedChannel ? c.id === selectedChannel : true))?.id ?? null : null} onSelect={(c) => { setSelectedChannel(c.id); setSelectedBundle(null); }} />
          <BundlesTable bundles={data.bundles} selected={bundle?.id ?? null} onSelect={(b) => { setSelectedBundle(b.id); setSelectedChannel(null); }} />
          {data.releases.length ? (
            <section aria-labelledby="rel-h">
              <h2 id="rel-h" className="title-4 pb-2 text-text-subtle">Recent release actions</h2>
              <ul className="m-0 flex list-none flex-col divide-y divide-border border-y border-border p-0 body-6">
                {data.releases.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                    <span className="font-mono caption-5 text-text-subtle">{time(r.at)}</span>
                    <span>{r.action === "autopause" ? "Auto-paused" : r.action[0]!.toUpperCase() + r.action.slice(1)}</span>
                    <span className="font-mono">{r.channel}{r.headcode ? ` ${r.headcode}` : ""} {r.action === "release" || r.action === "percent" || r.action === "rollback" ? `${r.percent}%` : ""}</span>
                    <span className="caption-5 text-text-subtle">{r.actor === "system" ? r.cause : r.actor.replace(/^(key|user):.*/, (m) => (m.startsWith("key") ? "API key" : "member"))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <Inspector key={bundle?.id ?? "none"} data={data} bundle={bundle} canWrite={canWrite} onChanged={() => { setLoading(true); void load(); }} />
      </div>
    </div>
  );
}
