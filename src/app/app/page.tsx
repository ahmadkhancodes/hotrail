import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { buildLine, type LineView as LineData } from "@/lib/ship/line";
import { shipDeps } from "@/lib/ship/context";
import { appUrl } from "@/lib/env";
import { FirstRunSetup } from "./first-run-setup";
import { LineView } from "./line-view";

export const metadata = { title: "Line" };
export const dynamic = "force-dynamic";

export default async function LinePage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { app: wanted } = await searchParams;
  const deps = await shipDeps();
  const apps = await deps.db.listApps(ctx.org.id);

  if (apps.length === 0) {
    return (
      <>
        <PageHeader title="Line" description={`${ctx.org.name}: every channel is a track, every release is a train.`} />
        <EmptyState
          title="No trains on this line yet."
          body={<FirstRunSetup orgId={ctx.org.id} baseUrl={appUrl()} canCreateKey={can(ctx.role, "apiKey", "manage")} />}
          visual={
            <div className="w-full max-w-xl border border-dashed border-border-input" aria-label="Example of your first channel row" role="img">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-4 px-4 py-3 opacity-60">
                <span className="body-5 text-text">production</span>
                <span className="rounded-sm border border-plate-ink bg-plate px-1 font-mono caption-3 tracking-widest text-plate-ink">1A00</span>
                <span className="block h-2 bg-border-input" />
                <span className="caption-4 text-text"><span aria-hidden className="text-lamp-green">●</span> Live</span>
              </div>
              <p className="border-t border-dashed border-border-input px-4 py-2 caption-5 text-text-muted">Example: your first upload shows up as headcode 1A00.</p>
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
