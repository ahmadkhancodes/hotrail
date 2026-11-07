"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Notice } from "@/components/ui/states";

interface Pref { kind: "release" | "rollback" | "autopause"; label: string; help: string; enabled: boolean }

export function NotificationsClient({ initial }: { initial: Pref[] }) {
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: Pref) {
    setBusy(p.kind);
    setError(null);
    const r = await api<{ enabled: boolean }>("/api/notifications/preferences", { body: { kind: p.kind, enabled: !p.enabled } });
    setBusy(null);
    if (r.ok) setPrefs((all) => all.map((x) => (x.kind === p.kind ? { ...x, enabled: r.data.enabled } : x)));
    else setError(r.message);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice tone="danger" title="That did not save">{error}</Notice> : null}
      <Panel title="Channel emails">
        <ul className="flex flex-col divide-y divide-border">
          {prefs.map((p) => (
            <li key={p.kind} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-1">
                <p id={`n-${p.kind}`} className="title-4 text-text">{p.label}</p>
                <p className="body-6 text-text-subtle">{p.help}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-labelledby={`n-${p.kind}`}
                disabled={busy === p.kind}
                onClick={() => toggle(p)}
                className="button-sm min-h-11 min-w-20 rounded-md border border-border-strong px-3 py-2 text-text transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring"
              >
                {p.enabled ? "On" : "Off"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
