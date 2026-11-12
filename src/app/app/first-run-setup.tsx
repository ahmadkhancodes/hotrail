"use client";
import Link from "next/link";
import { useState } from "react";
import { authError } from "@/components/app/api";
import { CopyButton } from "@/components/app/copy-button";
import { Button, buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { setupKeyName, setupSnippet } from "@/lib/onboarding/setup-snippet";

/**
 * First value in one click: creates an "All" scope key and fills it into the exact commands to run,
 * so nobody has to visit Settings, name a key and compose the export line by hand.
 */
export function FirstRunSetup({ orgId, baseUrl, canCreateKey }: { orgId: string; baseUrl: string; canCreateKey: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snippet = setupSnippet({ apiKey: key, baseUrl });

  async function createKey() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.apiKey.create({ name: setupKeyName(), organizationId: orgId, metadata: { scope: "all" } });
    setBusy(false);
    if (err || !data) return setError(authError(err, "We could not create the key. Try again, or create one in Settings, API keys."));
    setKey((data as unknown as { key: string }).key);
  }

  return (
    <div className="flex flex-col gap-3">
      <p>Run these in your Capacitor project. init finds your app and creates a signing key, upload sends your web build, release puts it live on the production channel.</p>
      <pre aria-label="Setup commands" className="max-w-full overflow-x-auto border border-border bg-surface-sunken px-3 py-2 font-mono caption-2 text-text"><code>{snippet}</code></pre>
      {key ? (
        <p role="status" className="caption-4 text-text-subtle">Your key is filled in above. Copy it now: we cannot show it again. You can delete it any time in Settings, API keys.</p>
      ) : null}
      {error ? <p role="alert" className="caption-4 text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {key ? <CopyButton value={snippet} label="Copy commands" /> : canCreateKey ? (
          <Button type="button" size="sm" onClick={createKey} disabled={busy}>{busy ? "Creating key…" : "Create a key and fill it in"}</Button>
        ) : (
          <Link href="/app/settings/api-keys" className={buttonClass("secondary", "sm")}>Ask an admin for an API key</Link>
        )}
        <Link href="/docs/quickstart" className={buttonClass("tertiary", "sm")}>Read the quickstart</Link>
      </div>
    </div>
  );
}
