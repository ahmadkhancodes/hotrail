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
