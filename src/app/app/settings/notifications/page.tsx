import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { NOTIFY_KINDS, notifyScope } from "@/lib/notify";
import { NotificationsClient } from "./notifications-client";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const prefs = await Promise.all(NOTIFY_KINDS.map(async (k) => ({ ...k, enabled: !(await db.isSuppressed(ctx.user.email, notifyScope(k.kind))) })));
  return (
    <>
      <PageHeader title="Notifications" description={`Email to ${ctx.user.email} when something changes on a channel. Each email also has a one-click unsubscribe link. Usage warnings at 50, 70, 90 and 100% of your plan always go to the organization owners.`} />
      <NotificationsClient initial={prefs} />
    </>
  );
}
