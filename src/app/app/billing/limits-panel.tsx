"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { fmt } from "@/components/app/labels";

export interface LimitsInfo {
  used: number;
  included: number;
  allowed: number;
  overageUsd: number;
  overageRate: number;
  limited: boolean;
  capUsd: number;
  isPaid: boolean;
  eventDays: number;
  buildMinutes: number;
  apps: number;
  period: string;
}

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);

/** What counts against the plan, overage as reported, and the owner's monthly overage cap. */
export function LimitsPanel({ info, canManage }: { info: LimitsInfo; canManage: boolean }) {
  const [cap, setCap] = useState(String(info.capUsd));
  const [saved, setSaved] = useState(info.capUsd);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const over = Math.max(0, info.used - info.included);

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await api<{ capUsd: number }>("/api/billing/overage", { body: { capUsd: Number(cap) } });
    setBusy(false);
    if (r.ok) { setSaved(r.data.capUsd); setCap(String(r.data.capUsd)); } else setErr(r.message);
  }

  return (
    <Panel title="Limits and overage" description={`Monthly active users are devices that checked for an update in ${info.period} (UTC). The count resets each month.`}>
      <div className="flex flex-col gap-6">
        {info.limited ? (
          <Notice tone="danger" title="New downloads are paused">
            You reached your monthly active user limit. Installed apps keep the version they have. Upgrade{info.isPaid ? " or raise your overage cap" : ""} to resume downloads now, or wait for the month to roll over.
          </Notice>
        ) : null}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="caption-4 text-text-muted">Monthly active users</dt><dd className="body-5 text-text tabular-nums">{fmt(info.used)} of {fmt(info.included)}</dd></div>
          <div><dt className="caption-4 text-text-muted">Over the plan</dt><dd className="body-5 text-text tabular-nums">{fmt(over)} users, {usd(info.overageUsd)} at {usd(info.overageRate)} each</dd></div>
          <div><dt className="caption-4 text-text-muted">Event history kept</dt><dd className="body-5 text-text tabular-nums">{info.eventDays} days</dd></div>
          <div><dt className="caption-4 text-text-muted">Apps</dt><dd className="body-5 text-text tabular-nums">{fmt(info.apps)}</dd></div>
        </dl>
        <p className="body-6 text-text-subtle">
          Overage is reported here, not charged yet: extra users cost {usd(info.overageRate)} each on paid plans and are only billed after you confirm. Build minutes ({fmt(info.buildMinutes)} a month on this plan) arrive with native builds in v1.
        </p>
        {info.isPaid ? (
          <form className="flex max-w-md flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Field label="Monthly overage cap (USD)" htmlFor="overage-cap" hint={`0 keeps overage off, so downloads pause at ${fmt(info.included)} users. A cap of $15 allows about ${fmt(Math.floor(15 / info.overageRate))} extra users.`} error={err}>
              <Input id="overage-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} disabled={!canManage || busy} />
            </Field>
            <div><Button type="submit" variant="secondary" loading={busy} disabled={!canManage || cap === String(saved)}>Save cap</Button></div>
          </form>
        ) : <p className="body-6 text-text-subtle">Overage is available on paid plans. On Free, downloads pause at {fmt(info.included)} users.</p>}
      </div>
    </Panel>
  );
}
