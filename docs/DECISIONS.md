# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

## Phase 0 (5 Nov 2026)
1. **Cloudflare Workers/D1/KV → Vercel + Mongo + R2.** Hot path = Vercel Edge route reading a pointer JSON from R2 (behind `PointerStore`). Reason: owner's Vercel-first rule; keeps "never touches the DB" true.
2. **Paddle → Stripe** via `BillingAdapter`, per BATCH1_PLAN. Plans/prices exactly per the brief; `metadata.app=hotrail`, lookup keys `hotrail_*`.
3. **Bundle host:** `hotrail-cdn.buffersoltech.com` (first level, Universal SSL, R2 custom domain) instead of `/f/*` through Vercel, to avoid Vercel bandwidth cost. `/f/<sha256>` redirects there. Single hostname rule is about avoiding deeper subdomains; this is not deeper.
4. **Cron:** Cloudflare Worker per minute + Vercel daily backstop (Hobby limits).
5. **API key hashing:** 256 bit random keys + SHA 256 with prefix lookup instead of argon2id (high entropy secret; fast verify on the CLI path). Deviation from the brief, same practice as GitHub/Stripe.
6. **Signing:** customer held Ed25519 keys sign manifests in the CLI (server never holds a private key by default); managed signing is opt in.
7. **Spam/abuse:** kit ALTCHA instead of Turnstile. **Email:** Resend adapter now, Postfix later (workbook's banned list lifted by owner decisions). **Backups:** GitHub Actions mongodump to R2.
8. **Design overrides (written per DESIGN_PLAYBOOK §3):** three font families (Barlow Condensed, Atkinson Hyperlegible, Red Hat Mono, all OFL, via next/font so self hosted) instead of the skill's one-typeface whitelist; workbook dark palette instead of the six skill dark values; Phosphor icons (skill whitelist) in place of the workbook's Lucide; no hero text gradient. Reason: ICP is a developer under incident pressure, the workbook specifies the signal box system, and none of the category uses it.
9. **Plugin e2e** runs in GitHub Actions (macOS runner + Android emulator) because there is no Mac farm.
10. **Oddities resolved:** Free plan has 2 apps, paid unlimited; "annual = 2 months free" is NOT used in copy (real saving is about 14%, state the dollar figure instead); no GBP/CAD prices until Stripe currency options are configured; no testimonials or logos until real ones exist.
11. **Palette revised (5 Nov, orchestrator review):** primary family changed from railway green to deep signal navy with amber as the highlight, to avoid looking like DockCrate (dock green on warm paper) in the public side by side. Green remains only as the go lamp. Tokens in DESIGN.md section 5; mock and screenshots regenerated.
