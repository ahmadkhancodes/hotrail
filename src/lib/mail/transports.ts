import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import type { MailMessage, MailTransport, SendResult } from "./types";

/** Dev/test/stub transport: keeps messages in memory and logs the message id only (subjects carry sign-in codes and names). */
type OutboxMessage = MailMessage & { from: string; id: string; at: Date };
// Kept on globalThis: Next bundles each route separately, so a module-level array is not shared between the auth route and /api/dev/outbox.
const g = globalThis as { __hotrailOutbox?: OutboxMessage[] };
export const outbox: OutboxMessage[] = (g.__hotrailOutbox ??= []);

export function consoleTransport(): MailTransport {
  return {
    name: "console",
    async send(msg) {
      const id = uuidv7();
      outbox.push({ ...msg, id, at: new Date() });
      if (outbox.length > 200) outbox.shift();
      log.info("mail_console", { id, category: msg.category ?? "transactional" });
      // Stub mode only (no mail provider yet): MAIL_CONSOLE_PRINT=1 prints the body so magic links can be used from logs.
      if ((process.env.NODE_ENV === "development" || process.env.MAIL_CONSOLE_PRINT === "1") && process.env.NODE_ENV !== "test")
        console.log(`\n--- mail ${id} ---\n${msg.text}\n---\n`);
      return { id, provider: "console", accepted: true };
    },
  };
}

/**
 * BufferSol mail gateway (POST {url}/v1/send, Bearer key). The gateway forces this app's From, so no `from` is sent.
 * `record: "metadata"` keeps sign-in codes / links out of the gateway log. One Idempotency-Key covers every attempt,
 * so a retry after a timeout that did reach the gateway never double-sends. Retries 429/502/503 and network errors once.
 */
const GATEWAY_RETRY = new Set([429, 502, 503]);
export function gatewayTransport(url: string, key: string, fetchFn: typeof fetch = fetch, attempts = 2): MailTransport {
  return {
    name: "gateway",
    async send(msg): Promise<SendResult> {
      const idem = `hotrail-${uuidv7()}`;
      const body = JSON.stringify({
        to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo,
        record: "metadata", category: msg.category === "marketing" ? "marketing" : "transactional",
      });
      let status = 0;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const res = await fetchFn(`${url.replace(/\/+$/, "")}/v1/send`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idem },
            body,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
            return { id: j.messageId ?? j.id ?? uuidv7(), provider: "gateway", accepted: true };
          }
          status = res.status;
          if (!GATEWAY_RETRY.has(status)) break;
        } catch {
          status = 0;
        }
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`mail_send_failed_${status}`);
    },
  };
}

/** Transactional provider adapter (Resend REST over fetch, no SDK). */
export function resendTransport(apiKey: string, fetchFn: typeof fetch = fetch): MailTransport {
  return {
    name: "resend",
    async send(msg): Promise<SendResult> {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html,
          reply_to: msg.replyTo, headers: msg.headers,
          tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`mail_send_failed_${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: body.id ?? uuidv7(), provider: "resend", accepted: true };
    },
  };
}

/**
 * SMTP adapter stub for the VPS (own Postfix/KumoMTA). Implement with nodemailer when the VPS exists;
 * the interface stays the same so no caller changes.
 */
export function smtpTransport(): MailTransport {
  return {
    name: "smtp",
    async send() {
      throw new Error("smtp_transport_not_configured");
    },
  };
}
