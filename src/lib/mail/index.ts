import { product } from "@/config/product";
import { appUrl, env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { log } from "@/lib/logger";
import { hmacSha256Hex } from "@/lib/ids";
import { consoleTransport, resendTransport, smtpTransport } from "./transports";
import type { MailMessage, MailTransport, SendResult } from "./types";

export type { MailMessage, MailTransport, SendResult } from "./types";

export function transportFromEnv(): MailTransport {
  const e = env();
  const p = e.MAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : "console");
  if (p === "resend" && e.RESEND_API_KEY) return resendTransport(e.RESEND_API_KEY);
  if (p === "smtp") return smtpTransport();
  return consoleTransport();
}

const unsubSecret = () => env().BETTER_AUTH_SECRET ?? "dev-unsubscribe-secret";

/** Signed one-click unsubscribe token (RFC 8058). */
export async function unsubscribeToken(email: string, scope: string) {
  return hmacSha256Hex(unsubSecret(), `${email.toLowerCase()}|${scope}`);
}

export async function unsubscribeUrl(email: string, scope: string) {
  const t = await unsubscribeToken(email, scope);
  const q = new URLSearchParams({ e: email.toLowerCase(), s: scope, t });
  return `${appUrl()}/api/mail/unsubscribe?${q}`;
}

/**
 * The one way to send mail. Checks the suppression list (transactional mail skips marketing scopes),
 * adds List-Unsubscribe + List-Unsubscribe-Post for non-transactional mail.
 */
/** Subjects carry user text (org and inviter names): one line, no control characters, bounded length. */
export function safeSubject(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export async function sendMail(msg: MailMessage, transport: MailTransport = transportFromEnv()): Promise<SendResult> {
  const db = await getDb();
  const category = msg.category ?? "transactional";
  const scope = category === "transactional" ? "transactional" : (msg.scope ?? category);
  if (category !== "transactional" && (await db.isSuppressed(msg.to, scope)))
    return { id: "", provider: transport.name, accepted: false, suppressed: true };
  const { scope: _scope, ...wire } = msg;
  const headers = { ...msg.headers };
  if (category !== "transactional") {
    const url = await unsubscribeUrl(msg.to, scope);
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return transport.send({ ...wire, subject: safeSubject(wire.subject), headers, from: msg.from ?? env().MAIL_FROM ?? product.mailFrom });
}

/**
 * For request handlers: a provider rejection (bad address, rate limit, outage) must not 500 the request or leak
 * provider details. Logs the status code only (never the address or provider body).
 */
export async function sendMailSafe(msg: MailMessage, transport?: MailTransport): Promise<SendResult | null> {
  try {
    return await sendMail(msg, transport);
  } catch (e) {
    log.warn("mail_send_failed", { code: /mail_send_failed_\d+/.exec((e as Error).message)?.[0] ?? "send_error" });
    return null;
  }
}
