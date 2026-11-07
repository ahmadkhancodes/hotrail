import { product } from "@/config/product";

// Plain, accessible HTML email templates (no external CSS, no images). Each returns {subject, text, html}.
// Kept dependency free instead of react-email to stay small; the shape matches react-email's render output.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, footer = `${product.fullName} · ${product.company}`) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#f7f7f7;font-family:ui-sans-serif,system-ui,sans-serif;color:#181818">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e2e2;border-radius:8px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:14px;font-weight:600">${esc(product.name)}</p>
${bodyHtml}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#767676">${esc(footer)}</p>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;padding:12px 16px;background:#181818;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

export function magicLinkEmail(url: string) {
  const subject = `Sign in to ${product.name}`;
  const text = `Use this link to sign in to ${product.name}. It works once and expires in 10 minutes.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Sign in to ${esc(product.name)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:#404040">This link works once and expires in 10 minutes.</p>
${button(url, "Sign in")}
<p style="margin:0;font-size:12px;line-height:16px;color:#767676;word-break:break-all">Or paste this address into your browser: ${esc(url)}</p>
<p style="margin:16px 0 0;font-size:12px;color:#767676">If you did not ask for this, you can ignore this email.</p>`);
  return { subject, text, html };
}

export function otpEmail(code: string) {
  const subject = `${code} is your ${product.name} code`;
  const text = `Your ${product.name} sign-in code is ${code}. It expires in 10 minutes.`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Your sign-in code</h1>
<p style="margin:16px 0;font-size:30px;letter-spacing:4px;font-family:ui-monospace,monospace;font-weight:600">${esc(code)}</p>
<p style="margin:0;font-size:14px;color:#404040">It expires in 10 minutes.</p>`);
  return { subject, text, html };
}

export function inviteEmail(opts: { orgName: string; inviter: string; url: string; role: string }) {
  const subject = `${opts.inviter} invited you to ${opts.orgName} on ${product.name}`;
  const text = `${opts.inviter} invited you to join ${opts.orgName} on ${product.name} as ${opts.role}.\n\nAccept: ${opts.url}`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Join ${esc(opts.orgName)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:#404040">${esc(opts.inviter)} invited you as ${esc(opts.role)}.</p>
${button(opts.url, "Accept invitation")}`);
  return { subject, text, html };
}

export function noticeEmail(opts: { title: string; body: string; actionUrl?: string; actionLabel?: string }) {
  const text = `${opts.title}\n\n${opts.body}${opts.actionUrl ? `\n\n${opts.actionUrl}` : ""}`;
  const html = layout(opts.title, `<h1 style="margin:0 0 8px;font-size:20px">${esc(opts.title)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:#404040">${esc(opts.body)}</p>
${opts.actionUrl ? button(opts.actionUrl, opts.actionLabel ?? "Open") : ""}`);
  return { subject: opts.title, text, html };
}

const fmtN = (n: number) => new Intl.NumberFormat("en").format(n);

/** Usage threshold email (50, 70, 90 and 100% of the plan's monthly active users). */
export function usageEmail(o: { percent: number; used: number; limit: number; plan: string; period: string; billingUrl: string; limited: boolean }) {
  const title = o.percent >= 100 ? `Your app has reached ${fmtN(o.limit)} MAU` : `Your app is at ${o.percent}% of ${fmtN(o.limit)} MAU`;
  const body = o.percent >= 100
    ? `${fmtN(o.used)} devices checked for updates in ${o.period}, which is the ${o.plan} plan limit of ${fmtN(o.limit)}. ${o.limited ? "New downloads are paused until the month ends or you upgrade. " : ""}Apps that are already installed keep working on the version they have.`
    : `${fmtN(o.used)} devices checked for updates in ${o.period}, ${o.percent}% of the ${o.plan} plan limit of ${fmtN(o.limit)}. At 100% new downloads pause; installed apps keep their current version. You can upgrade or set an overage cap at any time.`;
  return noticeEmail({ title, body, actionUrl: o.billingUrl, actionLabel: "See usage and plans" });
}

/** Release, rollback and auto-pause notifications to subscribed members. */
export function channelEmail(o: { kind: "release" | "rollback" | "autopause"; app: string; channel: string; version: string; headcode: string; percent?: number; detail?: string; url: string }) {
  const where = `${o.app} / ${o.channel}`;
  const title =
    o.kind === "release" ? `Released ${o.headcode} to ${where}${o.percent !== undefined && o.percent < 100 ? ` at ${o.percent}%` : ""}`
    : o.kind === "rollback" ? `Rolled back ${where} to ${o.headcode}`
    : `Rollout of ${o.headcode} paused${o.percent !== undefined ? ` at ${o.percent}%` : ""}: ${o.detail ?? "failure rate above the limit"}`;
  const body =
    o.kind === "release" ? `Version ${o.version} is now live on ${where}.`
    : o.kind === "rollback" ? `${where} now serves version ${o.version} (${o.headcode}) at 100%.`
    : `Hotrail by BufferSol paused ${where} on version ${o.version}. Devices keep the version they have; no new devices get it until you resume or roll back.`;
  return noticeEmail({ title, body, actionUrl: o.url, actionLabel: "Open the Line" });
}
