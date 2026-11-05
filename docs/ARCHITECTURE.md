# Hotrail by BufferSol: architecture (Vercel + MongoDB Atlas + Stripe + Cloudflare R2 + the kit)

Scope: the full workbook MVP (all 12 P0s in `docs/brief.md`). The workbook assumed Cloudflare Workers + D1 + Paddle + own mail servers. Owner decisions (docs/factory/BATCH1_PLAN.md) replace that with Vercel-first. Every swap is logged in `docs/DECISIONS.md`. Everything that needs an always-on server sits behind an interface so it moves to the VPS later without touching callers.

## 1. What runs where
| Piece | Runs on | Why / notes |
|---|---|---|
| Marketing, docs, console (`/`, `/docs`, `/app`) | Vercel, Next.js App Router (Node runtime) | One project `hotrail`, one hostname `hotrail.buffersoltech.com`. |
| **Update API hot path** `POST /api/updates`, `/api/stats` ingest shim, `/api/channel` | Vercel **Edge runtime** route handlers | No Mongo driver on the edge, by design: the hot path reads only a small pointer JSON (below). Any error returns `200 {"message":"no_new_version_available"}`. |
| Control API `/api/v1/*`, console server actions, auth, billing, webhooks | Vercel Node functions (Fluid compute) + MongoDB Atlas | Mongo is the control store behind the kit's DB interface. |
| Bundle files and manifests | **Cloudflare R2** (our account), bucket `hotrail-bundles`, public through first level custom domain `hotrail-cdn.buffersoltech.com` | Zero egress. Not a deeper subdomain (Universal SSL covers it). `/f/<sha256>` on the main host 302s to the CDN host for docs compatibility. Update responses point straight at the CDN host so bytes never transit Vercel bandwidth. |
| Channel pointers (hot map) | R2 object `ptr/<appId>/<channelId>.json`, `Cache-Control: max-age=5` | R2 plays the role of Workers KV; read by the edge route with `fetch` + CDN cache. Behind `PointerStore` interface (swap for Cloudflare KV or Redis on the VPS). |
| Schedulers every minute (auto pause evaluator, webhook retries, usage alerts) | **Cloudflare Worker cron** `infra/cron-worker/` (free) calling `POST /api/cron/<job>` with `CRON_SECRET` | Vercel Hobby cron is once a day; the Worker is the per minute clock. Vercel Cron stays as a daily backstop (rollups, retention, nightly reconcile). Behind `JobRunner` so the VPS can host it. |
| Event ingest and rollups | Vercel Node function `/api/stats` (beacons arrive here), Mongo `device_events` + `usage_buckets` | Failures stored 100%, successes sampled 10%. |
| Backups | GitHub Actions nightly `mongodump`, `age` encrypted, to a second R2 bucket; monthly restore drill workflow | Atlas M0 has no backups. Replaces restic + Storage Box. |
| Mail | kit `Mailer`: Resend adapter now, SMTP/Postfix adapter on the VPS later | Banned list in the workbook is lifted by the owner's batch decision. |
| Error tracking | `ErrorReporter` interface; console + Vercel logs now, GlitchTip (Sentry protocol) on the VPS later | |
| Status page and probes | Static `/status` fed by a cron probe job and a second probe from GitHub Actions (second provider) | Uptime Kuma on the VPS later. |
| npm packages (published by CI) | `@buffersol/hotrail` (CLI), `@buffersol/hotrail-updater` (MIT Capacitor plugin: TS + Swift + Kotlin), `@buffersol/hotrail-mcp` (MCP server, stdio), `@buffersol/hotrail-core` (manifest, signing, delta, bucketing, semver, fingerprint; shared by app, CLI, tests) | pnpm workspace in this repo: `packages/*`. Needs an npm token (MANUAL_STEPS). |
| Native builds (v1), SAML, GlitchTip, Prometheus, Postfix, probes | **VPS later** | Out of MVP; interfaces `BuildRunner`, `SecretVault`, `Mailer` (SMTP), `ErrorReporter` reserve the seams. |

### Interfaces that make the VPS move cheap
`Db` (Mongo / memory, from the kit), `BlobStore` (R2 S3 API now; any S3 later), `PointerStore` (R2 JSON now; KV/Redis later), `EventSink` (Mongo now; ClickHouse later), `JobRunner` + cron routes (Cloudflare Worker now; VPS cron later), `Mailer`, `BillingAdapter` (Stripe now; Paddle later if wanted), `ErrorReporter`, `SecretVault` (env KEK now), `BuildRunner` (v1). Each has a contract test and a console/memory implementation.

## 2. Hot path detail (satisfies FR-025 and "never touch the DB")
1. Device calls `POST /api/updates` (Capgo self hosted protocol; the `@capgo/capacitor-updater` fields `platform, app_id, device_id, version_name, version_build, version_os, plugin_version, custom_id, is_prod, is_emulator`).
2. Edge handler resolves channel: per device override (from `ptr/<appId>/overrides.json`, capped at 500 entries, larger sets via per device objects `ov/<appId>/<hash>.json` fetched only for devices in a flagged list), else default channel for platform.
3. Reads `ptr/<appId>/<channelId>.json` = `{bundleVersion, zipUrl|manifestUrl, checksum, sessionKey?, rolloutPercent, paused, nativeFingerprints[], nativeFingerprintMode, signed}`.
4. Sticky bucketing: `hash(device_id + channel_id) mod 100 < rolloutPercent`. Compatibility: device `version_build` must be in the bundle's allowed native builds, else "no update".
5. Returns `{version, url, checksum[, session_key]}` or `{message}`. HTTP 200 always.
Stats beacons (`statsUrl`) are fire and forget to `/api/stats`; `channelUrl` serves the per device channel get/set. Everything is clean room from the public self hosted docs; no Capgo code is read or copied.
Cache bust: a release or rollback writes a new pointer then the edge cache expires within 5 s; target "manifest switches under 10 s globally".
Chaos test (P0 AC): block Mongo and the control API; `/api/updates` keeps serving from pointers.

## 3. Data model (MongoDB database `hotrail`; every query goes through one data access layer requiring `orgId`; lint rule bans raw `db.collection` outside it)
TTL fields are `Date`. Better Auth owns `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey` (via the kit).
| Collection | Key fields / indexes |
|---|---|
| `orgs` | `_id`, name, slug, plan (free/solo/maker/team/scale), `stripeCustomerId` unique sparse, mauLimit, billingState, graceUntil |
| `apps` | `orgId`, bundleId (unique with orgId), signingPublicKey (Ed25519), signingMode (customer/managed), compatMode (native/capgo_plugin), defaultChannelIds per platform |
| `bundles` | `appId`, version (unique per app), headcode (4 char, unique per app), nativeFingerprint, manifestKey, zipKey?, sizeBytes, signed, createdBy, state (active/softDeleted), `deletedAt`/ttl |
| `fileBlobs` | `_id` sha256, sizeBytes, refCount |
| `channels` | `appId`, name (unique per app), platform, currentBundleId, previousBundleId, rolloutPercent, autopauseThreshold, minSample, paused, protected, lock |
| `deviceOverrides` | `appId+deviceId` unique, channelId |
| `device_events` | `appId, ts, deviceId(hash), bundleId, channelId, action, cause`; TTL `expiresAt` by plan (7/30/60/90 d) |
| `usage_buckets` | `appId, bucket(5 min), channelId, bundleId, counts{check,download,applied,failed,rolledBack}`; `usage_months` (HLL MAU sketch, checks, bytes) |
| `releases` | channel change history incl. rollback/pause with actor and diff |
| `webhooks`, `webhook_deliveries` | kit outbound webhooks (HMAC-SHA256, retries, delivery log) |
| `audit_log` | append only: actor, ts, ip, action, diff |
| `email_messages`, `email_suppressions` | VERP token, status; hashed address, reason, until |
| `abuse_flags` | orgId, rule, score, status |
| `rate_limits`, `stripe_events` | kit |
Reserved for v1: `build_jobs`, `signing_secrets` (envelope encrypted).
Capacity note (Atlas M0, 512 MB): raw events have 7 day TTL at launch, 5 minute buckets keep charts cheap, sampling 10% for successes; upgrade path is a paid Atlas tier or ClickHouse on the VPS behind `EventSink`.

## 4. Routes and API
Marketing: `/`, `/pricing`, `/compare/*`, `/appflow-alternative`, `/capacitor-live-updates`, `/compliance`, `/security`, `/status`, legal pages, `/docs/*`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/.well-known/security.txt`.
Auth: `/sign-in`, `/sign-up`, `/api/auth/*` (Better Auth: GitHub, Google, magic link; passkeys/TOTP are v1 but come free with the kit).
Console: `/app` (org switcher) → `/app/[org]/apps/[app]/{line,bundles,devices,events,settings}`, `/app/[org]/settings/{keys,members,billing,webhooks,audit}`, onboarding checklist, release dialog, command palette (`/`).
Public device API (edge): `POST /api/updates`, `POST /api/stats`, `GET|POST|DELETE /api/channel`.
Control API (Node, API key or session): `POST /api/v1/upload/plan`, `POST /api/v1/upload/finalize`, `GET /api/v1/bundles`, `POST /api/v1/channels/:id/release`, `.../rollback`, `.../pause`, `GET /api/v1/stats`, `GET|POST /api/v1/devices`, `POST /api/v1/export`, `/api/mcp` (HTTP MCP) .
Billing: `/api/billing/checkout`, `/api/billing/portal`, `/api/stripe/webhook`. Cron: `/api/cron/{autopause,usage,webhooks,retention,rollup,probe,reconcile}`. Ops: `/api/health`, `/api/config`.

## 5. P0 build map and acceptance criteria
Milestones: see `docs/ROADMAP.md`. Each AC below becomes a test (Vitest unless noted).

**P0-1 Auth, orgs, roles, API keys** (kit + Hotrail roles owner/admin/developer/viewer). Better Auth, Mongo adapter; keys: 256 bit random, prefix shown, SHA 256 hashed, scope upload/read/all, expiry. AC: sign up to dashboard under 60 s (Playwright timing); viewer cannot release (role matrix test); upload only key cannot change channels; duplicate bundle ID in an org rejected; invited email joins instead of creating an org.

**P0-2 Upload pipeline and delta.** CLI hashes files (SHA 256), `upload/plan` returns missing blobs and presigned R2 PUT URLs (direct to R2, avoiding the 4.5 MB function body limit), `upload/finalize` verifies sizes, range reads magic bytes for native binaries (ELF, DEX, Mach O, `.jar`/`.so`/`.dex`/`.dylib`/`.framework` names), zip bomb check (entry count, ratio, total size cap), builds the manifest, verifies the customer's Ed25519 signature. AC: second upload of the same build transfers under 1% of bytes; tampered manifest rejected by `core` verify and the plugin; native file upload fails with policy link; bundle page shows native fingerprint (Capacitor + plugin versions). Managed signing (server held key encrypted by env KEK) is opt in for dashboard/MCP uploads.

**P0-3 Update API and migration endpoint.** Section 2. AC: stock `@capgo/capacitor-updater` in a test app updates with only updateUrl/statsUrl/channelUrl changed (contract fixtures, plus a Playwright-less protocol test harness); every thrown error still returns 200 no update; bucketing distribution within 1% over 100k synthetic ids and stable per device; p95 under 80 ms target measured from a Vercel region probe (target, not guarantee).

**P0-4 MIT Capacitor plugin `@buffersol/hotrail-updater`** (TS, Swift, Kotlin, clean room on Capacitor core only). Strategies background/immediate/prompt, signature check, file assembly from manifest, `setServerBasePath` switch, `notifyAppReady` within N seconds else revert on next launch, beacons. AC: Android instrumented test on emulator and iOS simulator test run in **GitHub Actions** (macOS runner) since there is no Mac farm; crash on boot bundle reverts; beacons visible under 60 s. This is the biggest technical risk (section 7).

**P0-5 Channels, rollouts, rollback, compatibility.** Default channel per platform, overrides, sticky percent rollout, auto pause evaluator (Worker cron every minute, per channel lock via Mongo `findOneAndUpdate` lease), one click rollback, incompatible device gets no update. AC: synthetic failures pause within 2 five minute buckets; rollback writes pointer in under 10 s end to end; deletion of the last 3 bundles per channel blocked; concurrent release lock.

**P0-6 Observe.** Event stream, adoption chart per bundle/channel in 5 min buckets, device lookup (current bundle, channel, last seen). AC: chart totals match raw counts within 2% (property test on rollups); device lookup under 300 ms.

**P0-7 Webhooks.** Kit outbound webhooks for release, pause, rollback, failure spike. AC: HMAC verification vector test; retry schedule logged; disable after 50 failures.

**P0-8 Billing and limits.** Stripe (test mode first) behind `BillingAdapter`; prices exactly per the brief, `metadata.app=hotrail`, lookup keys prefixed `hotrail_` (e.g. `hotrail_solo_monthly`, `hotrail_solo_annual`, …); annual toggle; Free, Solo, Maker, Team self serve, Scale = sales contact. Extra MAU overage as a metered price behind a customer cap. AC: plan limits update within 1 minute of webhook; MAU emails at 50/70/90/100% once per threshold per period; at the limit new downloads pause (pointer flag `limited`), installed apps keep working; card declined gives 7 day grace. Paddle is not used; if the owner wants it later it is a second adapter.

**P0-9 Email.** `Mailer` with provider adapter now (Resend), console adapter in dev; templates welcome, 90% usage, auto pause alert, invite, magic link; suppression list, RFC 8058 unsubscribe where applicable (marketing only), VERP style bounce token in `email_messages`. AC: hard bounced address never mailed again (test); SPF/DKIM/DMARC records published for the sending domain (manual step); Postfix, MTA-STS, TLS-RPT and Gmail/Outlook/Yahoo seed tests are **deferred to the VPS** and listed in ROADMAP as post MVP infra.

**P0-10 Ops and safety.** Audit log on every release/rollback/key/member change (actor, time, IP, diff); export zip of bundles, manifests, events; `ErrorReporter` wired (test error appears with release tag in logs now, GlitchTip later); status page with two provider probes (Vercel cron + GitHub Actions); nightly encrypted backups and monthly restore drill with checksum; sign up abuse rules (ALTCHA, per IP velocity, disposable domain list, review queue; scripted 50 sign ups per minute from one IP/ASN header set blocked in test). Turnstile from the workbook is replaced by the kit's ALTCHA; ASN rules use Vercel geo/IP headers.

**P0-11 MCP server.** `@buffersol/hotrail-mcp` (stdio) and `/api/mcp` (HTTP) with tools `upload`, `release`, `rollback`, `stats`. AC: release and rollback require an explicit `confirm: true` round trip; no LLM calls on our side.

**P0-12 CLI, CI recipes, docs.** `npx @buffersol/hotrail init | upload | release | rollback | status`; GitHub Actions and GitLab CI recipes; docs (MDX), `llms.txt`, "Copy for agent", compare pages with "last checked" dates, compliance guide, `security.txt`. AC: CLI end to end test against a local dev server; docs build has zero dead links; CI banned dependency check passes (see 6).

## 6. Security and policy checks
Zod on every input; CSP and security headers; `__Host-` cookies; Origin/CSRF check; per key and per IP rate limits; signed upload URLs with short TTL; secrets only in Vercel env and (for Worker) Cloudflare secrets; tenant isolation test (0 cross tenant reads). CI script `scripts/check-banned.ts` fails on paid LLM, SMS, auth SaaS, monitoring SaaS, Capgo packages or code in dependencies (adapted: the allowed list is extended with Vercel, MongoDB Atlas, Stripe, Resend by owner decision). `THIRD_PARTY_LICENSES.md` generated. Clean room rule: no file from `@capgo/capacitor-updater` or Cap-go repos is read.

## 7. Risks and mitigations
1. **Biggest: the plugin cannot be device tested on a Mac farm.** Capacitor's internal `setServerBasePath` behavior can change in majors and iOS/Android native code is the most error prone piece. Mitigation: GitHub Actions macOS runners and Android emulator, pinned Capacitor versions tested per release, crash revert, kill switch flag in the pointer, protocol compatible fallback (customers can keep `@capgo/capacitor-updater` in migration mode).
2. Vercel Hobby is non commercial with short limits; **Vercel Pro is required before taking money** (manual step), and per minute cron needs the Cloudflare Worker.
3. Atlas M0 storage and connection limits under event load; mitigated by sampling, buckets, 7 day raw TTL, `EventSink` interface.
4. Email deliverability from a provider instead of own MTA; magic link also shown as an in app code; DNS records are a manual step.
5. Licence contamination: clean room, no Capgo code.
6. Trademark "Hotrail" is screened only; formal clearance before public launch.
7. Edge runtime constraints (no Node crypto APIs beyond WebCrypto); core package must be WebCrypto only. Ed25519 in WebCrypto is supported on Vercel Edge; fallback `@noble/ed25519`.
