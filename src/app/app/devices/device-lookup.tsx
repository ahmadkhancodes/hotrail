"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/states";
import { Plate } from "../line-view";
import type { DeviceLookup as Result } from "@/lib/ship/devices";

const ACTION: Record<string, { label: string; tone: "info" | "success" | "danger" | "warning" }> = {
  download: { label: "Downloaded", tone: "info" },
  applied: { label: "Applied", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rolledBack: { label: "Reverted on device", tone: "warning" },
};
const when = (iso: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(iso)) + " UTC";

export function DeviceLookup({ bundleId, initialQuery }: { bundleId: string; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; result: Result | null; message?: string }>({ status: "idle", result: null });

  async function run(query: string) {
    if (!query.trim()) return;
    setState({ status: "loading", result: null });
    try {
      const res = await fetch(`/api/v1/devices?appId=${encodeURIComponent(bundleId)}&q=${encodeURIComponent(query.trim())}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: "idle", result: (await res.json()) as Result });
    } catch {
      setState({ status: "error", result: null, message: "Could not look that device up. Check your connection and try again." });
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void run(q); };
  const d = state.result?.device;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="flex-1">
          <Field label="Device id or custom id" htmlFor="device-q" hint="The id the plugin sends as device_id, or the custom_id your app sets.">
            <Input id="device-q" name="q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} placeholder="5f1c2d3e-… or user-8841" />
          </Field>
        </div>
        <Button type="submit" loading={state.status === "loading"} disabled={!q.trim()}>Look up</Button>
      </form>

      {state.status === "error" ? <Notice tone="danger" title={state.message} /> : null}
      {state.result && !state.result.found ? (
        <Notice tone="info" title="No device with that id.">Devices are registered when they report in (after a download, apply or failure). Check the id and the app selected above.</Notice>
      ) : null}

      {d ? (
        <section aria-label="Device" className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <dl className="m-0 grid h-fit grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-border bg-surface p-4 body-6">
            <dt className="text-text-subtle">Device id</dt><dd className="m-0 break-all text-right font-mono">{d.deviceId}</dd>
            <dt className="text-text-subtle">Custom id</dt><dd className="m-0 text-right font-mono">{d.customId ?? "none"}</dd>
            <dt className="text-text-subtle">Platform</dt><dd className="m-0 text-right">{d.platform}</dd>
            <dt className="text-text-subtle">Running</dt>
            <dd className="m-0 text-right">{d.headcode ? <Plate code={d.headcode} className="mr-2 align-middle" /> : null}<span className="font-mono">{d.bundleVersion ?? "built in"}</span></dd>
            <dt className="text-text-subtle">Store build</dt><dd className="m-0 text-right font-mono">{d.versionBuild ?? "unknown"}</dd>
            <dt className="text-text-subtle">Channel</dt><dd className="m-0 text-right">{d.channel ?? "none"}{d.override ? <> <Badge tone="warning">override: {d.override}</Badge></> : null}</dd>
            <dt className="text-text-subtle">Last seen</dt><dd className="m-0 text-right">{when(d.lastSeenAt)}</dd>
          </dl>
          <div>
            <h2 className="title-4 pb-2 text-text-subtle">Recent events</h2>
            {state.result!.events.length === 0 ? (
              <p className="m-0 body-6 text-text-subtle">No events kept for this device. Raw events are kept for 7 days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left body-6 tabular-nums">
                  <caption className="sr-only">Recent events for this device, newest first</caption>
                  <thead><tr className="border-b border-border caption-5 text-text-subtle">
                    <th scope="col" className="p-2 font-bold">Time</th><th scope="col" className="p-2 font-bold">Event</th>
                    <th scope="col" className="p-2 font-bold">Bundle</th><th scope="col" className="hidden p-2 font-bold sm:table-cell">Channel</th><th scope="col" className="hidden p-2 font-bold md:table-cell">Plugin action</th>
                  </tr></thead>
                  <tbody>
                    {state.result!.events.map((e, i) => (
                      <tr key={`${e.ts}-${i}`} className="h-9 border-b border-border">
                        <td className="whitespace-nowrap px-2 font-mono caption-5">{when(e.ts)}</td>
                        <td className="px-2"><Badge tone={ACTION[e.action]?.tone ?? "info"}>{ACTION[e.action]?.label ?? e.action}</Badge></td>
                        <td className="px-2 font-mono">{e.bundleVersion ?? "built in"}</td>
                        <td className="hidden px-2 sm:table-cell">{e.channel ?? "none"}</td>
                        <td className="hidden px-2 font-mono md:table-cell">{e.cause}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
