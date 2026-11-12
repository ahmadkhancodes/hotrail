"use client";
import { ButtonLink } from "@/components/ui/button";
import { sessionCta } from "@/lib/marketing/session-cta";
import { useSignedIn } from "./use-signed-in";

/** A marketing call to action that becomes "Open dashboard" for signed-in visitors. The label swaps; the button box does not move. */
export function SessionButtonLink({ href, label, size = "lg" }: { href: string; label: string; size?: "md" | "lg" }) {
  const cta = sessionCta(useSignedIn(), { href, label });
  return <ButtonLink href={cta.href} size={size}>{cta.label}</ButtonLink>;
}
