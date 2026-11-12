import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { eventRetentionDays } from "@/lib/billing/limits";
import { requireOrg } from "@/lib/auth/session";
import { shipDeps } from "@/lib/ship/context";
import { DeviceLookup } from "./device-lookup";

export const metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ app?: string; q?: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { app: wanted, q } = await searchParams;
  const { db } = await shipDeps();
  const apps = await db.listApps(ctx.org.id);
  if (apps.length === 0) {
    return (
      <>
        <PageHeader title="Devices" description="Look up one device by its device id or your own custom id." />
        <EmptyState title="No devices yet." body="Devices show up here after your first upload, once an app with the plugin checks in." action={<Link href="/docs/quickstart" className={buttonClass("secondary", "sm")}>Read the quickstart</Link>} />
      </>
    );
  }
  const retentionDays = await eventRetentionDays(db, ctx.org.id);
  const current = apps.find((a) => a.bundleId === wanted) ?? apps[0]!;
  return (
    <>
      <PageHeader title="Devices" description={`${current.bundleId} · find one device and see what it was offered and what it did.`} />
      {apps.length > 1 ? (
        <nav aria-label="Apps" className="-mt-4 mb-4 flex flex-wrap gap-6 border-b border-border body-6">
          {apps.map((a) => (
            <Link key={a.id} href={`/app/devices?app=${encodeURIComponent(a.bundleId)}`} aria-current={a.id === current.id ? "page" : undefined}
              className={cn("py-3 text-text-subtle focus-visible:focus-ring", a.id === current.id && "font-bold text-text shadow-[inset_0_-3px_0_var(--focus)]")}>
              {a.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <DeviceLookup key={current.bundleId} bundleId={current.bundleId} initialQuery={q ?? ""} retentionDays={retentionDays} />
    </>
  );
}
