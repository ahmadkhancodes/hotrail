/** Pure label and target logic for marketing CTAs. `signedIn` is null until the session check returns. */
export const APP_HOME = "/app";
export const APP_BILLING = "/app/billing";

export interface CtaTarget { href: string; label: string }

/** A generic call to action (hero, final CTA): signed-in visitors go to the app instead of signup. */
export function sessionCta(signedIn: boolean | null, out: CtaTarget): CtaTarget {
  return signedIn ? { href: APP_HOME, label: "Open dashboard" } : out;
}

/** A pricing plan button: Free opens the app; paid plans go straight to billing with the plan preselected. */
export function planCta(signedIn: boolean | null, plan: { id: string; cta: string }, href: string, interval: string): CtaTarget {
  if (!signedIn) return { href, label: plan.cta };
  if (plan.id === "free") return { href: APP_HOME, label: "Open dashboard" };
  return { href: `${APP_BILLING}?plan=${encodeURIComponent(plan.id)}&interval=${encodeURIComponent(interval)}`, label: plan.cta };
}
