# Hotrail security review (adversarial, 2026-11-12)

Code, tests and docs only. **Not deployed.** Method: attacks against the locally running app (`next start`, memory DB, outbox mail) in `tests/e2e/security.spec.ts`, plus in-process exploit tests in `tests/unit/security-review.test.ts`. Each finding below had a test that failed on the old code before the fix. Earlier reviews: `docs/REVIEW.md` (P0/P1 list; its open P1s still apply).

## Threat model

**Assets**
- Customer release control: who can publish, roll back or pause a channel on an app that reaches end users' phones. A forged release is code execution on every device running that app (the web layer of a Capacitor app).
- Bundle signing keys (managed Ed25519 private keys sealed with the KEK; customer public keys), API keys (hashed by Better Auth), webhook signing secrets.
- Tenant data: apps, bundles, channels, devices and events, audit log (actor ids and IPs), billing records, member e-mails.
- Sessions and magic links; the founder admin page (`ADMIN_EMAILS`).
- Billing state: plan, trial, MAU and storage limits, overage cap.
- Availability of the update check (every device of every customer calls it) and of auto-pause.

**Actors**
- Anonymous internet user, including anyone who has a customer's public app id (it ships inside the app) and any device id.
- Signed-in user of another organization (the main IDOR actor).
- Low-privilege member of the same org (viewer or member) trying to escalate.
- Holder of a leaked scoped API key (`upload` or `read`).
- Someone who sees logs or a copied cookie; a malicious webhook receiver; forged Stripe events.

**Entry points**
- `/api/auth/*` (Better Auth: magic link, passkey, TOTP, organizations, invitations, API keys).
- `/api/v1/*` control API (API key or console session) and the signed blob `PUT`.
- Unauthenticated device endpoints: `/api/v1/updates/check`, `/stats`, `/channel` (GET/POST/DELETE), public files `/api/v1/files/*`.
- Console APIs: `/api/webhooks*`, `/api/audit*`, `/api/account*`, `/api/billing/*`, `/api/notifications/preferences`, `/api/admin/overview`.
- `/api/stripe/webhook`, `/api/cron/*` (bearer secret), `/api/mail/unsubscribe` (HMAC token), `/api/dev/outbox` (E2E only).
- Pages that redirect on `?next=`; outbound webhooks (SSRF); outbound e-mail.

## Findings (fixed in this change)

| ID | Severity | What an attacker could do | Fix |
|---|---|---|---|
| S-1 | **High** | **NoSQL operator injection on the unauthenticated device endpoints.** `stats` and `channel` passed raw JSON values to Mongo. `{"app_id": {"$regex": "^com\\.victim"}, "device_id": {"$ne": null}}` selected another customer's app. `DELETE /api/v1/updates/channel` then deleted that app's device overrides and republished its pointers. `POST` and `stats` wrote fake devices and events into it. Object values for `platform` and `version_name` were stored as is. A device id of `__proto__` resolved to `Object.prototype` in the pointer index. | Every device request is reduced to bounded strings at the boundary (`cleanBeacon`, `cleanChannelRequest` in `src/lib/ship/device.ts`); everything else is dropped. `getAppByBundleId` (Mongo) refuses non-strings. `recordActiveDevice` checks types. Override lookup uses own keys only (`Object.hasOwn`, `src/lib/hotpath/check.ts`). |
| S-2 | **Medium** | **Open redirect after sign-in.** `safeNext` blocked `//host` and `\` but not tabs or newlines. `/sign-in?next=/%09/evil.example` answered `Location: /<TAB>/evil.example`. Browsers strip the tab, so the visitor landed on `evil.example` (phishing right after a real sign-in). The same check runs after passkey sign-in, 2FA and onboarding. | `safeNext` refuses any control character or Unicode space, caps the length and requires the path to resolve to our own origin (`src/components/app/redirect.ts`). |
| S-3 | **Medium** | **Inbox flooding and Resend quota burn.** Better Auth limits only per client IP, and the IP comes from `x-forwarded-for`. Nine requests with nine IPs sent nine sign-in e-mails to one victim (`RULES.authEmail` existed but was never used). Org invites could flood an inbox the same way. | A Better Auth `before` hook (`src/lib/auth/email-limit.ts`) allows 5 e-mails per address per 10 minutes for `/sign-in/magic-link` and `/organization/invite-member`. After that it answers 429 with a plain message the sign-in form shows. |
| S-4 | **Medium** | **Session replay after sign-out.** With Better Auth's 5-minute cookie cache, a copied `session_token` + `session_data` pair still returned the full session after the owner signed out or revoked it. | Cookie cache off (`src/lib/auth/index.ts`); every session read checks the store. Cost: one indexed session lookup per request (`session.token` is indexed). |
| S-5 | **Medium** | **Viewers could read the audit log and billing records.** `/api/account/export` added `exportOrgData` for every org the user belongs to, whatever their role. A viewer got the org's audit log (actor ids, IPs, invited e-mails) and billing records, although `/api/audit` returns 403 to them. | Export filters each org by the user's role (`src/lib/account-export.ts`): audit needs `audit:read`, billing needs `billing:read`, webhooks need `webhook:read`. |
| S-6 | Low | **False success on another org's webhook.** `DELETE /api/webhooks/<other org's id>` answered `{deleted: true}` and wrote `webhook.deleted <their id>` into the caller's audit log. Nothing was deleted (the query is org scoped), but the false entry pollutes the audit log. | 404 and no audit entry unless the endpoint exists in the caller's org. |
| S-7 | Low | **Sign-in codes in logs.** The console mail transport (used in stub mode, also on a deployment with no Resend key) logged the subject, and the 2FA e-mail subject is `123456 is your Hotrail code`. Invite subjects contain user-chosen org and inviter names with no CR/LF filtering. | The transport logs the message id and category only. `sendMail` makes subjects one line, strips control characters and caps them at 200 characters. |
| S-8 | Low | **Mail outbox on a deployment.** `/api/dev/outbox` was gated only by `E2E_OUTBOX=1`. Copying that variable to Vercel would publish everyone's sign-in links. | It is also closed whenever `VERCEL` is set. |
| S-9 | Low (defense in depth) | `/admin` checked `ADMIN_EMAILS` in the layout only. | The page checks too, next to the data it reads. |

## Verified as holding (attacked, no finding)

- **Tenant isolation:** org B, with its own session and with its own API key, gets 404 on every read and write of org A's apps, line, bundles, channels, usage, devices, native builds, release, rollback, pause and bundle delete. Uploading under A's app id returns 409. B's app list, webhook list, deliveries and audit log do not contain A's data. Better Auth refuses B on A's API keys (create and list), set-active, full org, invite, update and delete.
- **Privilege:** an A viewer cannot make themselves owner, create keys, manage webhooks, read or export the audit log, pause channels or set the overage cap.
- **Auth:** magic links are single use (replay gives no session). The session cookie is HttpOnly + SameSite=Lax (and `__Host-`/Secure on https, see `cookieConfig`). `callbackURL` is checked by Better Auth's trusted origins. CSRF: cookie requests from a foreign `Origin` get 403 on every state-changing console API, `/api/v1/*` and Better Auth. GET handlers have no side effects except the HMAC-signed unsubscribe link.
- **Injection:** e-mail templates escape all user text. The audit CSV neutralises formulas (`csvCell`). React escapes rendered names. File keys are restricted to `zips/`, `manifests/` and `blobs/`, and the fs store refuses path escapes. Hot-path pointer keys require `SAFE_ID`.
- **SSRF:** webhook URLs are checked on save and again at send time: DNS resolved, private, loopback, link-local, CGNAT and v6 blocked, `redirect: "manual"`, 10 s timeout (`tests/unit/launch-hardening.test.ts`).
- **Webhooks in:** Stripe signature on the raw body with the SDK's 300 s tolerance. The entitlement is recomputed from Stripe on every event, so replays and out-of-order events converge. Customers of other apps are ignored.
- **Billing tampering:** checkout accepts only a plan and interval enum. The price is looked up server-side by `hotrail_` lookup key, the trial is granted once per customer, a second live subscription returns 409. Free-plan app, storage and MAU limits are enforced in the server's create paths.
- **Exposure:** API errors are `{error: code}` with no stack. `/api/health` reports only `unreachable` or `timeout`. `/api/config` holds flags only. No source maps in `.next/static`. The client bundle holds no secret values (its only `BETTER_AUTH_SECRET` match is the name of Better Auth's env getter). `NEXT_PUBLIC_` is used for the app URL only.
- **Dependencies:** `npm audit --omit=dev`: **0** vulnerabilities in production dependencies.

## Open (needs a product or platform decision)

| ID | Severity | Issue | Recommendation |
|---|---|---|---|
| O-1 | Medium | The client IP comes from `x-forwarded-for` (ours in `clientIp`, and Better Auth's). Vercel overwrites that header, so it is trustworthy there. On the planned VPS, or behind another proxy, anyone could pick their IP and dodge every per-IP limit (sign-in, device channel writes). | Before moving off Vercel, read the IP only from the proxy you run (`x-real-ip` set by it), and set Better Auth `advanced.ipAddress.ipAddressHeaders` to match. |
| O-2 | Medium | REVIEW P1-8 and P1-9 are still open: unauthenticated check and beacon traffic can inflate a customer's MAU or forge failure beacons that trigger auto-pause. S-1 removes the cross-tenant *query* problem, not this one. | Per-bundle download token from `check`, required by `stats`; per-IP limits on new devices. |
| O-3 | Low | ALTCHA (`src/lib/security/altcha.ts`, `/api/altcha`) exists but no form requires it. | After S-3 the risk is low. If abuse appears, require a solution after N sign-in requests per IP. |
| O-4 | Low | The Free plan's 2-app check is read then write. Two parallel first uploads can create a third app. | A unique counter, or a re-check after insert that deletes the extra app. |
| O-5 | Low | `check` and `stats` read the whole JSON body. They are bounded by the platform limit (4.5 MB on Vercel), not by the route. | Read at most 16 KB and answer "no update" beyond that, once the route moves to the edge. |
| O-6 | Low | The CSP allows `'unsafe-inline'` scripts (Next's inline bootstrap). `/api/auth/get-session` returns the session token in JSON (Better Auth default), so an XSS could read it even though the cookie is HttpOnly. | Nonce-based CSP via the proxy once Cache Components is decided (D-K3). |
| O-7 | Low (dev only) | `npm audit` (dev): the workspace packages pin `vitest@^2.1` (critical tinypool/vite advisories when the Vitest UI or dev server is exposed), and `eslint-config-next` pulls an old `minimatch`. Nothing ships to production. | Move `packages/*` to the root's `vitest@^5` (a major bump, outside the semver range this task allowed; needs a network install). |
| O-8 | Info | Invite e-mails carry a user-chosen org name, a phishing lever inherent to invitations. Subjects are now one line and bounded. | Show the inviter's verified e-mail next to the org name (already in the body). |

## Tests

- `tests/e2e/security.spec.ts`: 9 API-level attacks on the running app (IDOR across two orgs, viewer escalation, open redirect, mail flood with spoofed IPs, cookie flags and replay after sign-out, CSRF, operator injection, error and secret exposure). Before the fixes: IDOR audit pollution, viewer export, open redirect, mail flood and session replay failed.
- `tests/unit/security-review.test.ts`: 11 exploit tests; 7 failed on the old code, and the other 4 test the new modules (S-3, S-5).
