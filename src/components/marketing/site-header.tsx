"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { product } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useSignedIn } from "./use-signed-in";
import { APP_HOME } from "@/lib/marketing/session-cta";

const STAGGER_MS = 60;

const STAGGER_CAP_MS = 400;

/**
 * B7 navigation: a compact timetable bar floating 8px off the top edge, sized to the content column, on a translucent
 * white surface over a background blur; square corners like the rest of the board. Current page underlined in ink.
 * Mobile: full height panel (base surface at 95% with a strong blur), staggered links (60ms step, 400ms cap, 24px rise).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const signedIn = useSignedIn();
  // The menu counts as open only on the page it was opened on, so navigating closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpenFor(null);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [toggleRef.current, ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [])].filter(
        (x): x is HTMLElement => !!x,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!items.includes(active as HTMLElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const linkClass = (href: string) =>
    cn(
      "inline-flex min-h-11 items-center rounded-sm px-3 button-sm underline-offset-8 transition-colors duration-300 ease-out-kit hover:text-text focus-visible:focus-ring",
      isCurrent(href) ? "text-text underline decoration-2" : "text-text-subtle",
    );

  const panelItems = [
    ...product.nav.map((n) => ({ ...n, kind: "link" as const })),
    ...(signedIn
      ? [{ href: APP_HOME, label: "Open dashboard", kind: "cta" as const }]
      : [
          { href: "/sign-in", label: "Sign in", kind: "link" as const },
          { href: "/sign-in", label: "Start free", kind: "cta" as const },
        ]),
  ];

  return (
    <header className="fixed inset-x-0 top-2 z-50 px-2 sm:px-4">
      <div className="relative z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 border border-border bg-surface/80 px-2 py-0.5 backdrop-blur-md sm:px-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-text focus-visible:focus-ring" aria-label={`${product.fullName} home`}>
          <span aria-hidden className="inline-block h-3 w-4 border-y-4 border-action" />
          <span className="heading-6">{product.name}</span><span className="caption-5 hidden text-text-subtle sm:inline">by BufferSol</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {product.nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined} className={linkClass(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-1 md:min-w-[13rem]">
          {signedIn ? null : <Link href="/sign-in" className={cn(buttonClass("tertiary", "md"), "max-md:hidden")}>Sign in</Link>}
          <Link href={signedIn ? APP_HOME : "/sign-in"} className={cn(buttonClass("primary", "md"), "max-md:hidden")}>{signedIn ? "Open dashboard" : "Start free"}</Link>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => (open ? close() : setOpenFor(pathname))}
            className="inline-flex size-11 items-center justify-center rounded-sm text-text transition-colors duration-300 ease-out-kit hover:bg-surface-sunken focus-visible:focus-ring md:hidden"
          >
            <span aria-hidden className="relative block size-6">
              <span className={cn("absolute left-1 right-1 top-2 h-0.5 rounded-sm bg-current transition-transform duration-500 ease-out-kit", open && "translate-y-1 rotate-45")} />
              <span className={cn("absolute bottom-2 left-1 right-1 h-0.5 rounded-sm bg-current transition-transform duration-500 ease-out-kit", open && "-translate-y-1 -rotate-45")} />
            </span>
          </button>
        </div>
      </div>

      <div
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cn(
          "fixed inset-0 z-40 flex h-dvh flex-col bg-surface/95 px-4 pt-24 backdrop-blur-xl transition-[opacity,visibility] duration-300 ease-out-kit md:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav aria-label="Mobile" className="flex flex-col">
          {panelItems.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpenFor(null)}
              style={{ transitionDelay: open ? `${Math.min(i * STAGGER_MS, STAGGER_CAP_MS)}ms` : "0ms" }}
              className={cn(
                "transition-[opacity,transform] duration-500 ease-out-kit focus-visible:focus-ring",
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
                item.kind === "cta"
                  ? cn(buttonClass("primary", "lg"), "mt-8")
                  : "flex min-h-12 items-center border-b border-border heading-5 text-text",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
