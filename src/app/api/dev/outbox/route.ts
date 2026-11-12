import { json } from "@/lib/http";
import { outbox } from "@/lib/mail/transports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: last console-transport messages. 404 unless E2E_OUTBOX=1 (never set on Vercel). */
export async function GET(req: Request) {
  // Never on a Vercel deployment, even if the flag is copied there by mistake: it would hand out anyone's sign-in link.
  if (process.env.E2E_OUTBOX !== "1" || process.env.VERCEL) return json({ error: "not_found" }, 404);
  const to = new URL(req.url).searchParams.get("to");
  return json({ messages: outbox.filter((m) => !to || m.to === to).slice(-5).map((m) => ({ to: m.to, subject: m.subject, text: m.text })) });
}
