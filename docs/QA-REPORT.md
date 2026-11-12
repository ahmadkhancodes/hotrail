# QA report: battle test as the ICP (2026-11-12)

Method: production build (`next start`), `DB_DRIVER=memory`, `E2E_OUTBOX=1`, console mail, real Chromium. Every spec signs in through the UI and the e-mail outbox. Specs: `tests/e2e/qa/*.spec.ts`, regressions also in `tests/unit/qa-copy.test.ts`. The Playwright run is now `workers: 1` because Better Auth rate limits sign-in per IP (the helper waits and retries when the UI shows the rate-limit message).

## Journeys covered
- **New visitor** (`journey`): every internal link on `/`, `/pricing`, `/compare/capgo`, `/docs` resolves; sign-in form through the UI; magic link lands on onboarding; no console, CSP or hydration errors.
- **Pricing** (`marketing`): Monthly/Annual toggle changes prices, plan CTA goes to `/sign-in?plan=…`, landing Copy button gives feedback, mobile menu opens, Escape closes, menu links navigate, 404 page, all docs/legal/sitemap/robots/llms routes answer 200.
- **Signed out / access** (`access`): every `/app/*` page redirects to sign-in, APIs answer 401/403 not 500, invalid and blank e-mail explained, single-use and tampered magic links give the "expired" notice and a working form, sign-out closes the dashboard, open-redirect `next`/`callbackURL` refused, a second organisation cannot read or switch into the first one's keys/members.
- **Free user forms** (`forms`): API keys (empty, HTML/unicode/emoji, 200-char, duplicate names, delete dialog with Escape), webhooks (empty, `http://`, localhost, private IP, `javascript:`), member invite (empty, valid, duplicate), profile name (HTML, blank, persisted after reload), billing upgrade with Stripe not connected, devices empty state.
- **Webhooks happy path** (`webhooks`): add, duplicate, pause, resume, send test, delete with Escape and confirm.
- **Organisations** (`orgs`): switcher (Escape, create second org, switch back), notification switch persists after reload, delete-account dialog needs the phrase, invitation e-mail -> sign in -> accept -> lands in the org.
- **Plan limit** (`limits`): Free user's third app gets 402 `plan_limit` with a reason that matches the pricing copy; hostile app ids/versions/zips give 4xx never 5xx; Line view and device lookup at 375px with data.
- **Layout and accessibility** (`a11y-layout`): 14 pages x 375/1440 x light: no horizontal scroll, every control has an accessible name, pointer cursor on all clickable elements, 44px tap targets on phones; keyboard Tab to submit with visible focus.
- Existing specs (`flow`, `line`, `m3`, `m4`, `app-smoke`) kept unchanged and green.

## Defects found and fixed
1. **Test harness: dev outbox was empty** (`/api/dev/outbox` and the auth route got separate module copies, so every e-mail-based Playwright spec failed with `undefined.text`). The outbox now lives on `globalThis`. The existing specs had been failing for this reason.
2. **Creating an API key with a name over 32 characters failed** with "The name length is either too large or too small." although the field allows 60. Better Auth's default limit is now raised to 60 (`maximumNameLength`).
3. **Magic link opened from the e-mail could show raw JSON** `{"message":"Too many requests…"}` when several sign-ins came from one IP (office, shared NAT), a dead end. The verify route now has its own limit (30/min, the token is single use).
4. **Tap targets under 44px on phones**: all `sm` buttons (Copy, Delete, Remove, Pause...), the billing interval switch; the theme toggle was squeezed to 40px wide in the sidebar. Fixed in `button.tsx`, `billing-client.tsx`, `theme.tsx`.
5. **Inconsistent label**: billing said "Yearly", pricing said "Annual". Now "Annual".
6. **Wrong number in copy**: device lookup said "Raw events are kept for 7 days" for every plan; it now shows the plan's real retention.

## Open, not fixed (needs a decision)
- **Low:** the rate-limit message says "Wait a minute" although the sign-in limit window is short; accurate enough, wording could use `retry-after`.
- **Low:** Devices "Look up" is disabled while the field is empty with no reason shown (the hint above explains the field). Could show the reason on hover/aria-describedby.
- **Medium (design call):** magic-link sign-in is limited to a few requests per minute per IP by Better Auth's built-in rule; teams behind one IP can see "Too many attempts" at the sign-in form. Raising it is a security trade-off.
- **Not testable here:** real Stripe checkout return (Stripe not connected: the UI shows the calm "not connected" notice), passkey and TOTP ceremonies (need an authenticator), the native plugin on devices, 3-month overage nudge (not built, see REVIEW.md).
- The Vercel Analytics script 404s on `next start` locally (only exists on Vercel); ignored by the console watcher.

## Battle hardening (2026-11-12)
Fixed: blob PUT signature-before-body, case-folded manifest paths. Verified by unit tests only; browser CSP run, tenant isolation e2e, Stripe replay e2e and resilience e2e remain open.

## Post-redesign regression pass (2026-11-12, after dark-mode removal, "departure board" redesign, hardening)
Specs: `tests/e2e/qa2/{public,app}.spec.ts`, `tests/e2e/qa2/probe.ts` (in-page audit), unit `tests/unit/qa2-regressions.test.ts`. Run against `next start` with the memory DB and outbox mail, light only, 375 and 1440.

**Journeys covered:** public pages (/, /pricing, docs index + three docs, compare, both legal pages, sign-in, two-factor, 404) audited for brand fonts (Jost / Albert Sans / DM Mono only), horizontal scroll, clipped text, WCAG text contrast (computed against the real background), console, CSP and hydration errors; every enabled button on /, /pricing, /docs, /compare/capgo and /sign-in clicked and checked for an observable effect; signed in as a free user with two apps: all ten dashboard screens audited the same way, every button clicked, Escape closes every dialog it opens; phone Line view selection; checkout return (canceled, success without a session); sign-in lands on the page asked for; sign-out returns home and the dashboard is closed again; device lookup; OG image and icons answer 200. The earlier `qa/` specs (forms, limits, orgs, webhooks, access, a11y) were re-run unchanged and are green. No old brand colours, fonts or dark-mode code found in src, e-mails, OG image or legal/docs pages (also enforced by `design-system` and `no-dark-mode` unit tests).

**Defects found and fixed**
1. **Root error page (`global-error.tsx`) lost the brand fonts.** It replaces the root layout, so the font CSS variables were never set and it rendered in the system font. It now sets them.
2. **Phone: tapping a channel or bundle in the Line view appeared to do nothing**: the inspector (rollout, Raise, Pause, Rollback) sits below the tables on screens under 1280px. Selection now scrolls it into view (respects reduced motion). Test: `qa2/app` "phone: choosing a channel or bundle…".
3. **Returning from Stripe Checkout with Cancel showed no feedback.** `/app/billing?checkout=canceled` now says "Checkout canceled. Nothing was charged."
4. **Devices "Look up" was disabled with no reason** (open item from the first QA pass): it now has a title saying what to enter first.

**Checked, no defect:** sign-in `next` preserved, no open redirect; checkout answers 503 `payments_disabled` while Stripe is not connected and the UI shows the calm notice (the console watcher in `qa2/app` allows exactly that 503); the Monthly/Annual toggle, Line view channel buttons and Refresh are idempotent when already selected / no new data, so the click crawler skips them on purpose; plan numbers on the pricing page come from `src/config/product.ts`; no invented logos, counts or testimonials found in marketing copy.

**Open**
- **Low:** the click crawler cannot tell a no-op from a visual-only effect (e.g. a Copy button whose feedback is a tooltip), so Copy buttons are covered by the `qa/marketing` spec only.
- **Not testable here:** real Stripe checkout and return with a session, passkey/TOTP ceremonies, native plugin on devices, Vercel Analytics (404s locally).
- Earlier open items about sign-in rate-limit wording and the shared-IP limit are unchanged.
