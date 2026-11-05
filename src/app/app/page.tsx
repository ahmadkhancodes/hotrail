import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CopyButton } from "@/components/app/copy-button";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { buildLine, type LineView as LineData } from "@/lib/ship/line";
import { shipDeps } from "@/lib/ship/context";
import { LineView } from "./line-view";

export const metadata = { title: "Line" };
export const dynamic = "force-dynamic";

export default async function LinePage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { app: wanted } = await searchParams;
  const deps = await shipDeps();
  const apps = await deps.db.listApps(ctx.org.id);

  if (apps.length === 0) {
    const cmd = "npx @buffersol/hotrail init";
    return (
      <>
        <PageHeader title="Line" description={`${ctx.org.name}: every channel is a track, every release is a train.`} />
        <EmptyState
          title="No trains on this line yet."
          body={<>Run the CLI in your Capacitor project. It finds your app, creates a signing key, and uploads your first bundle.<br /><code className="mt-2 inline-block">{cmd}</code></>}
          action={
            <div className="flex flex-wrap gap-2">
              <CopyButton value={cmd} label="Copy command" />
              <Link href="/app/settings/api-keys" className={buttonClass("secondary", "sm")}>Create an API key</Link>
              <Link href="/docs/quickstart" className={buttonClass("tertiary", "sm")}>Read the quickstart</Link>
            </div>
          }
        />
      </>
    );
  }

  const current = apps.find((a) => a.bundleId === wanted) ?? apps[0]!;
  const canWrite = can(ctx.role, "data", "write");
  let initial: LineData | null = null;
  try {
    initial = await buildLine(deps, { orgId: ctx.org.id, scope: "read", actor: `user:${ctx.user.id}` }, current.bundleId);
  } catch {
    initial = null; // the client shows the error state with a retry
  }
  return (
    <>
      <PageHeader title="Line" description={`${current.bundleId} · signing ${current.signingMode === "managed" ? "managed by Hotrail" : "with your own key"}`} />
      {apps.length > 1 ? (
        <nav aria-label="Apps" className="-mt-4 flex flex-wrap gap-6 border-b border-border pb-0 pt-0 body-6">
          {apps.map((a) => (
            <Link
              key={a.id} href={`/app?app=${encodeURIComponent(a.bundleId)}`} aria-current={a.id === current.id ? "page" : undefined}
              className={cn("py-3 text-text-subtle focus-visible:focus-ring", a.id === current.id && "font-bold text-text shadow-[inset_0_-3px_0_var(--focus)]")}
            >
              {a.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className={apps.length > 1 ? "pt-4" : undefined}>
        <LineView key={current.bundleId} bundleId={current.bundleId} initial={initial} canWrite={canWrite} />
      </div>
    </>
  );
}
