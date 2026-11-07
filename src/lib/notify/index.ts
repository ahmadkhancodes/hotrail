import { channelEmail, usageEmail } from "@/lib/mail/templates";
import type { MailMessage } from "@/lib/mail/types";
import type { Db } from "@/lib/db/types";

// Who gets which email. Usage emails go to the org owners (account mail, always sent). Release, rollback and
// auto-pause emails go to every member who has not turned that kind off (suppression scope `notify:<kind>`).

export type NotifyKind = "release" | "rollback" | "autopause";
export const NOTIFY_KINDS: { kind: NotifyKind; label: string; help: string }[] = [
  { kind: "release", label: "Releases", help: "A bundle goes live or its rollout percent changes." },
  { kind: "rollback", label: "Rollbacks", help: "A channel is reversed to its previous bundle." },
  { kind: "autopause", label: "Auto-pause", help: "A rollout is paused because failures passed the limit." },
];
export const notifyScope = (k: NotifyKind) => `notify:${k}`;

export interface Recipients {
  owners(orgId: string): Promise<string[]>;
  members(orgId: string): Promise<string[]>;
}

export interface UsageNotice { percent: number; used: number; limit: number; plan: string; period: string; limited: boolean }
export interface ChannelNotice { app: string; channel: string; version: string; headcode: string; percent?: number; detail?: string }

export interface Notifier {
  usage(orgId: string, n: UsageNotice): Promise<void>;
  channel(orgId: string, kind: NotifyKind, n: ChannelNotice): Promise<void>;
}

export interface NotifierEnv {
  db: Db;
  recipients: Recipients;
  send: (m: MailMessage) => Promise<unknown>;
  baseUrl: string;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export function createNotifier(env: NotifierEnv): Notifier {
  const safe = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { env.log?.("notify_failed", { message: (e as Error).message }); }
  };
  return {
    usage: (orgId, n) => safe(async () => {
      const t = usageEmail({ ...n, billingUrl: `${env.baseUrl}/app/billing` });
      for (const to of new Set(await env.recipients.owners(orgId))) await env.send({ to, ...t, category: "transactional", tags: { kind: "usage" } });
    }),
    channel: (orgId, kind, n) => safe(async () => {
      const t = channelEmail({ kind, ...n, url: `${env.baseUrl}/app` });
      for (const to of new Set(await env.recipients.members(orgId))) {
        if (await env.db.isSuppressed(to, notifyScope(kind))) continue;
        await env.send({ to, ...t, category: "notification", scope: notifyScope(kind), tags: { kind } });
      }
    }),
  };
}
