"use client";
import { useEffect, useMemo, useRef } from "react";
import { Section } from "@/components/ui/layout";

const STEP_MS = 70;

/**
 * B11 tagline reveal: a large statement whose words light up one by one as each crosses a trigger line
 * (an IntersectionObserver per word, the line sits 30% above the viewport bottom). Words rest at 30% opacity
 * of the text colour and switch once; they never dim again. Under reduced motion the CSS shows full colour at once.
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const s of spans) s.dataset.on = "true";
      return;
    }
    // Lines cross the trigger together, so crossings only raise a target; words then switch on one at a time.
    let target = 0;
    let lit = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      timer = undefined;
      if (lit >= target) return;
      spans[lit]!.dataset.on = "true";
      lit += 1;
      if (lit < target) timer = setTimeout(step, STEP_MS);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Crossing the line now, or already above it (fast scroll, deep link).
          if (!e.isIntersecting && e.boundingClientRect.top >= 0) continue;
          const i = spans.indexOf(e.target as HTMLElement);
          target = Math.max(target, i + 1);
          io.unobserve(e.target);
        }
        if (!timer) step();
      },
      { rootMargin: "0px 0px -30% 0px", threshold: 1 },
    );
    for (const s of spans) io.observe(s);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [words.length]);

  return (
    <Section>
      {label ? <p className="caption-3 mb-6 text-text-subtle">{label}</p> : null}
      <p ref={ref} className="heading-4 md:heading-2 hero-measure text-text">
        {words.map((w, i) => (
          <span key={i} className="kit-word" data-word="" data-on="false">
            {w}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </Section>
  );
}
