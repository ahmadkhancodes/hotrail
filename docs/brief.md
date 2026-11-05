# Hotrail by BufferSol

Source: workbook `04-hotrail-by-buffersol.xlsx` (29 sheets, prepared 3 Nov 2026, prices in USD observed 3 Nov 2026; "est." = workbook's own estimate). Always write the product name in full as "Hotrail by BufferSol" (site, console, CLI output, emails, docs). Brand name should live in one config value.

## Snapshot
- One-liner: a half-price, fully in-house challenger to Capgo: live (over-the-air) updates for Capacitor apps with channels, staged rollouts, auto-pause and one-click rollback. Same core features as Capgo at about half the price, secure by default, with our own MIT device plugin and zero third-party APIs in the delivery path (only Paddle collects payments).
- Category: OTA / live-update service for Capacitor (also legacy Cordova/Ionic) mobile apps; developer tooling SaaS.
- Original product being cloned: Capgo (https://capgo.app). Evidence: $33,476 MRR, 1,213 subscriptions, $587,810 all-time revenue, ~7,800 users (TrustMRR, Stripe-verified, 3 Nov 2026); ARPU ~$27.6/mo.
- Domain: single hostname `hotrail.buffersoltech.com` (zone buffersoltech.com on Cloudflare). Marketing at `/`, docs at `/docs`, console at `/app`, API at `/api`, bundle files at `/f`. Do NOT create deeper subdomains (they need Advanced Certificate Manager).
- Slug: not stated explicitly; the product slug is `hotrail`; npm CLI package `@buffersol/hotrail`; plugin `@buffersol/hotrail-updater`.
- Company: BufferSol Technologies. Market: US first, then Canada and UK. US English spelling on every page.
- Verdict in workbook: GO WITH CAUTION (three credible rivals, security liability, on-call load of running own mail/monitoring/build farm).
- Time to MVP: 11 weeks solo with Claude Code (was 8 before the in-house policy); native builds follow in weeks 12-14.
- Name rationale: "hot" as in hot updates/hotfixes, "rail" as the release track. Runner-ups: FixRail, PushRail. Screened only, not formally cleared (see Risks).

## ICP
Who pays: mobile developers and small product teams in US/CA/UK shipping Capacitor (and legacy Cordova/Ionic) apps: indie devs, agencies running many client apps, SaaS companies with a companion app, mid-size consumer apps. Also every team still on Ionic Appflow (access ends 31 Dec 2027).

| Attribute | Definition |
|---|---|
| Segment | Companies/agencies shipping a Capacitor/Cordova app on both stores, changing the web layer often: consumer ordering/retail, subscription and fitness apps, SaaS companion apps, marketplaces, mobile agencies. Qualifies: @capacitor/core v5+ or cordova, live on both stores, >= 2 web-layer releases a month. Disqualify: React Native, Flutter, fully native, PWAs not in stores, apps released twice a year |
| Company size | 2-200 employees, ~$0.5M-$50M revenue, 1-10 people touching the mobile app. Disqualify: >1,000 employees with internal mobile-platform team and mandatory SOC 2 Type II gate |
| Geography | US first, then Canada and UK |
| Buyer title | Head of Mobile, Engineering Manager, CTO/co-founder (<50 staff), agency Technical Director; can spend <= $1,500/yr without procurement |
| End user title | Frontend/mobile dev, full-stack dev, release engineer, QA lead, agency developer |
| Buying committee | Small teams: dev is buyer. Mid-size: dev champion + eng manager + security reviewer + finance for annual > $1,000 |
| Tech-stack signals | Ionic/Vite + React/Angular/Vue; Supabase or Firebase; `@capgo/capacitor-updater`, `@capawesome/capacitor-live-update`, `cordova-plugin-ionic` (Appflow) or code-push in package.json; fastlane in repo |
| Trigger events | Appflow ending 31 Dec 2027; CodePush retirement fallout; 1-star review spike after bad release; hotfix stuck in review; Capgo price change/security advisory; new mobile hire; second app launched; Capgo annual renewal |
| Pain intensity | Score >= 3: at least one review-blocked hotfix a quarter, >= 3 releases a month, or a client SLA |
| Budget / ACV | Solo $6.99 to Team $49.99/mo (ACV $72-$600); Scale $124.99/mo+ (~$1,500+); blended ACV ~ $210 (est., ARPU $17.50 x 12) |
| Sales motion | Self-serve by default. Free to Team no-touch. Scale (>= 250K MAU, SSO/SLA/DPA, Appflow migrations): 30-min call + migration help. "Talk to us" prompt at 200K MAU |

Personas (order of conversion speed):
- Indie Ian: solo Capacitor dev (US), 1-3 apps, 500-5K MAU, Vite+React+Supabase. Pain: Capgo $14 feels like "another subscription", bandwidth math. Objections: "I can self-host the plugin for free", "Will you be around in 2 years?". Pays $0-7/mo.
- Agency Alicia: lead at 10-40 person agency (Austin, Toronto, Manchester) with 5-30 client apps. Wants one console for all client apps, hand-off, fast hotfixes on SLAs. Pays $20-50/mo per org; values multi-org transfer.
- Platform Paul: Appflow refugee, mid-size US company (50K-500K MAU). Must migrate before 31 Dec 2027, pass security review. Pays $50-125/mo, annual contract.
- Security Sarah: security/compliance lead at US/UK fintech/health/education. Influencer not payer; unlocks $125+ Scale deals. Objection: SOC 2 not yet available.
- Builder Brooke: AI-app maker (Lovable/Bolt/Base44, Claude Code/Cursor) shipping Capacitor wrapper. Objection: "Is this allowed by Apple?". Pays $0-20/mo.

Where they hang out: r/capacitor, r/ionic, r/webdev; Ionic Forum; Capacitor/Ionic Discord; Capacitor GitHub discussions; X (#capacitorjs, #buildinpublic); JavaScript Weekly and Frontend Focus newsletters; Capawesome and Ionic blogs; React Miami, React Summit US (New York), ng-conf, VueConf US, React Advanced London; Lovable/Bolt/Base44 communities; Indie Hackers; Clutch/agency directories; LinkedIn.

Words they use (quotes/phrases from workbook): "Appflow alternative", "Capgo alternative", "CodePush alternative", "Capacitor live updates", "OTA", "hotfix", "stuck in review", "bandwidth", "MAU", "I cannot afford AppFlow pricing or CapGo pricing for my new project" (Ionic forum), "publish and fix without review".

Lookalikes (from Capgo public lists; target their smaller peers): US restaurant/ordering apps (Burger King, Jack in the Box, Denny's); grocery/retail (Sprouts, Wegmans, My Morrisons); subscription fitness/consumer (Sworkit Fitness); SaaS companion/marketplaces (Poll Everywhere, Freelancer; Capgo logos StyleSeat, Kick); mobile agencies.

Anti-ICP: React Native/Flutter teams (Expo/Shorebird fit better); native games; apps changing native code every release; anyone wanting OTA to change app purpose or ship hidden features; enterprises needing SOC 2 Type II and on-prem now; customers needing non-English support; buyers outside US/CA/UK wanting invoiced terms in year one.

## Problem & promise
- Problem: Capacitor/Ionic teams who ship a broken JS/CSS build wait 1-3 days for App Store / Play review to fix it.
- Promise: push the web layer straight to installed apps with channels, staged rollouts and rollback. "Fix your Capacitor app today. Not after review."
- Jobs to be done (pain 1-5): hotfix without store review (5; success: median upload to 50% adoption < 6 h); limit blast radius (4; < 1% of devices see bad bundle); undo a bad release (5; rollback reaches 90% of active devices < 1 h); avoid JS needing new native code (4; zero incompatible bundles applied); test a bundle on a real phone (3; preview < 2 min); prove what shipped to whom (3); keep costs predictable (4; no surprise invoices); migrate off Appflow/CodePush (4; < 1 day); build iOS without a Mac (3; first signed IPA < 30 min); let an AI agent ship safely (2; 0 incidents).
- Differentiators: (a) price half of Capgo on every tier; (b) margin/independence via own edge code on Cloudflare R2 (zero egress), content-addressed deltas, own MIT plugin, own Mac/Linux build farm; (c) trust: signing on by default, "no third party ever touches your update path" (workbook cites Capgo 2026 CVEs incl. auth bypass and past data exposure per shouldiuse.io); (d) migration: server answers the documented self-hosted protocol of `@capgo/capacitor-updater`; (e) Appflow refugees with a hard deadline.
- Competition reality check (workbook): crowded and price-compressed. Win on "Capgo-grade control room (rollouts, auto-pause, compatibility checks, observe) for half", not on "cheapest".

## MVP scope
Priority P0 = MVP, P1 = v1, P2 = v2 (workbook functional requirements). MVP in priority/build order with acceptance criteria:

1. Auth, orgs, roles, API keys (FR-001/002/003/006). AC: new user reaches dashboard < 60 s; viewer cannot release (role matrix test); upload-only key cannot change channels; duplicate bundle ID in same org rejected. GitHub/Google sign-in or email magic link from own mail servers; roles owner/admin/developer/viewer; scoped keys (upload/read/all) with expiry.
2. Upload pipeline / delta (FR-008/009/011/012). AC: second upload of same build sends < 1% bytes; Ed25519 signed manifest per bundle, signing on by default, tampered manifest rejected by plugin; upload with .so/.dex/.jar/.dylib/.framework fails with policy link, zip-bomb scan; native fingerprint (Capacitor + plugin versions) shown on bundle page.
3. Update API (hot path) + migration endpoint (FR-025). AC: stock `@capgo/capacitor-updater` updates with only URL changes (updateUrl/statsUrl/channelUrl). Hot path reads KV pointer + cached manifest only, never touches D1/servers; any error returns "no update" HTTP 200. Sticky bucketing = hash(device_id + channel_id) mod 100.
4. Own MIT Capacitor plugin (FR-022/023/024). AC: Swift/Kotlin/TS; background/immediate/prompt strategies, signature check, file assembly, setServerBasePath switch; passes iOS + Android e2e on our Mac farm; crash-on-boot bundle reverts on next launch (notifyAppReady within N s); beacons for download/apply/fail/rollback visible < 60 s.
5. Channels, rollouts, rollback, compatibility (FR-014..018, FR-020). AC: default channel per platform; per-device override (device ID or custom ID) effective next check; percentage rollout with sticky bucketing; auto-pause on failure rate > threshold after min sample (synthetic failures pause within 2 buckets; cron every 1 min); one-click rollback, manifest switches < 10 s globally; incompatible device gets "no update".
6. Observe (FR-028/029/031). AC: event stream (check, download, applied, failed, rolled back); adoption chart per bundle/channel in 5-min buckets matches raw counts +-2%; device lookup shows current bundle, channel, last seen.
7. Webhooks (FR-033). AC: signed (HMAC) payload for release, pause, rollback, failure spike; retries logged.
8. Billing and limits (FR-037/038/039). AC: Paddle checkout, plans, annual toggle; plan limits update within 1 min of webhook; MAU meter emails at 50/70/90/100% once per threshold per period; at limit new downloads pause, current version keeps working.
9. Email (FR-035/036). AC: own Postfix servers with SPF, DKIM 2048-bit (rspamd), DMARC aligned, MTA-STS, TLS-RPT; seed test lands in Gmail/Outlook/Yahoo inboxes; VERP bounce/complaint suppression, hard-bounced address never mailed again.
10. Ops and safety (FR-045..050). AC: audit log (actor, time, IP, diff) for every release/rollback/key/member change; export zip of bundles, manifests, events; GlitchTip test error appears with release tag; two-provider uptime probes + public status page (simulated outage shown < 3 min); nightly encrypted backups with monthly restore drill (restore passes checksum); sign-up abuse rules (Turnstile, per-IP/ASN velocity, disposable-domain list, review queue; scripted 50 sign-ups/min from one ASN blocked).
11. MCP server (FR-027). AC: upload, release, rollback, stats tools; agent release requires explicit confirmation; no LLM on our side.
12. CLI: `npx @buffersol/hotrail init | upload | release | rollback`, CI recipes (GitHub Actions, GitLab CI), docs + llms.txt, compare pages, compliance guide, security.txt.

Later (explicitly out of v1 MVP, per workbook):
- v1 (weeks 12-16): native cloud builds on own farm (FR-040/041/042: signed AAB/IPA < 30 min, secrets envelope-encrypted, included minutes + credits); passkeys/TOTP (FR-004); SSO SAML/OIDC on Team+ (FR-005); app transfer between orgs (FR-007); E2E bundle encryption AES-256-GCM (FR-010); headcode searchable (FR-013); protected channels (FR-019); native diff view (FR-021); public REST API + OpenAPI (FR-026); failure grouping by cause (FR-030); Slack/Discord formatting (FR-034); Appflow/Capgo import (FR-044); docs/console search (FR-051); preview app (QR); Appflow/CodePush import; binary patch (bsdiff-style) for large JS chunks.
- v2 (weeks 17-24): store publishing with customer's own App Store Connect/Play keys (FR-043); push via customer's APNs/FCM; crash + WebView timing beacons (FR-032); self-host edge worker (MIT); CodePush-compatible endpoint; build from git ref in cloud; ClickHouse if events outgrow Analytics Engine.
- Cut: AI-drafted support replies (replaced by Chatwoot canned replies + keyword rules); SMS.

## Core user flow
First-run to "aha" (flow "Onboarding"):
1. Sign up with GitHub or Google (no card, free plan forever). System creates org + personal API key, shows CLI command. Edge: email already used by invited org -> join instead.
2. Run `npx @buffersol/hotrail init` in project: detects capacitor.config and appId, adds plugin `@buffersol/hotrail-updater`; if `@capgo/capacitor-updater` present offers migration mode (swap 3 URLs now, change plugin at next store build). No Capacitor project -> docs link; Cordova -> legacy guide.
3. Rebuild and install app on a device once (native build). Waiting screen listens for first check-in; offline device -> troubleshooting checklist after 5 min (pulsing amber lamp).
4. First release: `npx @buffersol/hotrail upload` then `release`. Track view animates bundle "train" to device; "Applied" event = aha. Edge: checksum mismatch explained; signature missing -> generate key.

Ship a release: CLI/CI upload build dir with version + native build tag (hash files, upload only new files to R2, write signed manifest; native files rejected) -> compatibility check (diff vs channel's native builds; unknown native build warns, allow with flag) -> rollout dialog (channel, %, auto-pause threshold; concurrent release locks) -> observe adoption/failures (5-min buckets, auto-pause when failure rate > threshold after min sample).
Roll back: Channel page "Reverse to previous" -> manifest points to previous bundle; deletion of last 3 bundles per channel blocked.
Upgrade/billing: 90% MAU email + banner; Paddle overlay; card declined = 7-day grace, updates keep serving; at limit new downloads pause, never break installed apps; overage toggle with monthly cap.
Cancel: ask reason (1 click), offer downgrade to Free or pause; export bundles + history (zip, events CSV); annual plans keep access to period end.
Native build (v1): upload signing cert/profile/keystore (envelope-encrypted, fingerprint only shown) -> Build -> queued on own farm, ephemeral VM, live log, IPA/AAB link.

Journey touchpoints: Aware (Google "Capgo alternative"/"Appflow alternative", Reddit, X) -> Consider (pricing page, MAU calculator, security page) -> Sign up -> Activate (first update on device) -> Pay (usage meter, 70/90% emails; half-price banner; annual = 2 months free) -> Retain (release dashboard, weekly digest, webhooks) -> Refer ("Shipped with Hotrail by BufferSol" badge, 1 free month for both sides, agency partner page).

## Data model hints and integrations/APIs

Storage: Cloudflare D1 (SQLite) + Drizzle ORM for control data with nightly copies on own server; R2 for files/manifests; Workers KV for hot channel->manifest map; Workers Analytics Engine for events. All queries through one data-access layer requiring `org_id`.

Entities (from sheet 15):
- Org(id, name, plan enum free/solo/maker/team/scale, paddle_customer_id unique nullable, mau_limit)
- User(id, email lowercased unique, auth_provider enum github/google/email/sso)
- Membership(org_id+user_id PK, role owner/admin/developer/viewer)
- ApiKey(id, hash [argon2id], scope upload/read/all, expires_at)
- App(id, bundle_id unique per org, signing_public_key Ed25519, compat_mode native/capgo_plugin)
- Bundle(id, version semver unique per app, headcode char(4) unique per app, native_fingerprint, manifest_key (R2, signed JSON path->sha256), zip_key nullable (compat mode), size_bytes, created_by)
- FileBlob(sha256 PK, size_bytes, ref_count) content-addressed, dedupe across bundles
- Channel(id, name unique per app, current_bundle_id, previous_bundle_id, rollout_percent 0-100, autopause_threshold 0-1, protected)
- DeviceOverride(app_id+device_id PK, channel_id), DeviceEvent(app_id, ts, device_id, bundle_id, action, cause; append-only, Analytics Engine), UsageMonth(app_id+month; HLL MAU estimate, checks, bytes), Release(channel change history incl. rollback/pause), Webhook(id, url, secret, events[]), AuditLog(append-only)
- v1: BuildJob(id, app_id, platform, host mac-01|mac-02|linux-01, status, minutes, artifact_key), SigningSecret(id, org_id, kind p12|profile|keystore|asc_key|play_json, ciphertext_key, wrapped_dek, fingerprint)
- EmailMessage(id, template, to_hash, verp_token, status, smtp_id, ts), EmailSuppression(email_hash PK, reason, until, ts), AbuseFlag(org_id, rule, score, status, ts)

Repo layout (sheet 28): pnpm monorepo: apps/api (Workers, Hono), apps/console (SvelteKit on Pages), apps/site (Astro + Starlight + Pagefind), packages/cli (`@buffersol/hotrail`), packages/core (manifest, signing, delta, semver, fingerprint), packages/db, packages/ui (tokens, components, self-hosted fonts), packages/mcp, plugin/ (MIT Capacitor plugin ios/ android/ src/), services/mail-relay, services/saml, farm/runner (Swift macOS VM runner), ops/ (Ansible, OpenTofu, Grafana dashboards, runbooks). TypeScript everywhere; Vitest + Playwright; OpenTofu + Ansible.

Key system workflows: update check (per request, ~30/MAU/mo, p95 < 80 ms), bundle file delivery from `/f/<sha256>` (R2 + Cache API), upload ingest (CLI hashes -> missing SHA-256s -> pre-signed R2 multipart -> verify -> native-file/zip-bomb scan -> manifest -> Ed25519 sign), event ingest (failures stored 100%, successes sampled 10%), auto-pause evaluator (cron every 1 min, Durable Object lock per channel), MAU counter (hourly, HLL), usage alerts, transactional email via Queue -> HMAC-signed HTTPS relay -> Postfix -> rspamd DKIM, bounce handling (VERP; hard bounce = suppress; soft x3 = suppress 7 days), deliverability watch (parsedmarc, blocklists, Google Postmaster Tools/MS SNDS), retention cleanup (keep last 3 per channel, soft-delete 7 days), Paddle webhook sync (idempotent, nightly reconcile), customer webhooks (retry 24 h, disable after 50 failures), native build (v1), monitoring/paging (Prometheus, Alertmanager, ntfy), uptime probes every 60 s, nightly restic backups + monthly restore drill, abuse screening, security scanning daily.

### In-House Build Map (sheet 17)
Policy: pay no other company/API to serve customers. Effort = solo weeks with Claude Code; infra = fixed monthly (usage-based Cloudflare costs in sheet 07).

| Capability | Typical third party replaced | Our in-house build | Infra | Wks | $/mo | Notes/licence |
|---|---|---|---|---|---|---|
| Update API | Capgo cloud, Capawesome, Appflow | Hono Worker: KV pointer + cached signed manifest, sticky bucketing, native-compat check; migration endpoint for capacitor-updater protocol | Workers | 1.5 | 0 | Proprietary; protocol from public docs only |
| Bundle storage & CDN | Bunny, CloudFront, Fastly | R2 + Worker on /f/* with Cache API; fallback origin on own OVH (nginx) | R2 + Cache API | 1.0 | 0 | R2 usage variable |
| Delta/diff | Appflow diffs, vendor SDKs | Content-addressed SHA-256 dedupe in CLI + server; v1 bsdiff-style patch | CLI + Workers | 1.5 | 0 | bsdiff BSD-2 reference |
| Signing & encryption | Cloud KMS, HSM | Ed25519 (WebCrypto/libsodium), AES-256-GCM, per-app keys in Workers Secrets, offline root key on own hardware key | Workers Secrets | 1.0 | 0 | libsodium ISC |
| Device plugin | @capgo/capacitor-updater, Capawesome Live Update | Own MIT plugin (Swift/Kotlin/TS) | Mac farm for e2e | 3.0 | 0 | Clean-room; never copy MPL files |
| Authentication | Clerk, Auth0, Firebase Auth | Better Auth in Worker: GitHub/Google OAuth, magic link, passkeys, TOTP | Workers, D1 | 1.0 | 0 | MIT |
| SSO | WorkOS, Auth0 Ent. | samlify service on ops server + OIDC in Better Auth | Ops server | 1.5 | 0 | shared |
| Transactional email | Resend, Postmark, SES, SendGrid, Mailgun | Postfix + rspamd DKIM on 2 VPS own IPs; SPF/DKIM/DMARC (none -> quarantine -> reject), MTA-STS, TLS-RPT; 6-week warm-up from 50/day; VERP | 2 VPS, two providers | 2.0 | 12 | Ask providers to open port 25 |
| Notifications | Knock, Courier, Twilio | Queues + HMAC webhooks, customer's own Slack/Discord webhooks, in-app bell; SMS cut | Queues, D1 | 1.0 | 0 | |
| Control DB | Neon, Supabase, PlanetScale | D1 + Drizzle; nightly export to R2 + own server | D1 | 0.5 | 0 | |
| Queues/cron/locks | Inngest, Trigger.dev, managed Redis | Queues + Cron Triggers + Durable Objects | Cloudflare | 0.5 | 0 | |
| Device event analytics | Tinybird, ClickHouse Cloud, Mixpanel | Analytics Engine (90-day) + monthly rollups to D1; ClickHouse later | Analytics Engine | 1.0 | 0 | |
| Product analytics | PostHog, GA, Plausible cloud | Umami self-hosted, cookieless | Ops server | 0.3 | 0 | MIT |
| Error tracking | Sentry, Bugsnag | GlitchTip self-hosted | Ops server | 0.5 | 0 | MIT |
| Logs/metrics/paging | Datadog, Better Stack, New Relic, PagerDuty | Prometheus + Alertmanager, Grafana + Loki, ntfy | Ops server | 1.0 | 60 | Grafana/Loki AGPL: unmodified, internal only |
| Uptime + status page | Better Stack, Checkly, Statuspage | Uptime Kuma on 2 probe servers, static status page on Pages | 2 small VPS | 0.5 | 12 | MIT |
| Backups | Backblaze B2, AWS Backup | restic nightly -> second R2 bucket + Hetzner Storage Box; monthly restore drill | R2 + Storage Box | 0.5 | 5 | BSD-2 |
| Spam/abuse | Akismet, OOPSpam, reCAPTCHA | Turnstile + rules engine (velocity, disposable domains, size caps, native/zip-bomb scan, review queue) | Workers, D1 | 1.0 | 0 | |
| Search | Algolia DocSearch | Pagefind static (docs); D1 FTS5 (console) | Pages, D1 | 0.3 | 0 | MIT |
| Data sourcing (leads) | Apollo, ZoomInfo, paid scrapers/proxies | Own scripts on public pages only, robots.txt respected, no proxies | Linux server | 0.5 | 0 | |
| Former AI feature: support assistant | OpenAI/Anthropic API bots | CUT; Chatwoot canned replies + keyword->docs rules; MCP needs no LLM | Ops server | 0.5 | 0 | Chatwoot MIT |
| iOS native builds | Capgo builds, Codemagic, Bitrise, EAS, rented Macs | 2 Mac mini M4 owned + colocated, Virtualization.framework runner (<= 2 macOS VMs/Mac), ephemeral VM per job, fastlane gym | 2 Macs + colo | 2.0 | 153 | fastlane MIT |
| Android builds + CI + code hosting | GitHub Actions paid, CircleCI | Linux server: Docker Android SDK, Woodpecker CI, Forgejo, gitleaks, Trivy, osv-scanner, Semgrep CE, Renovate CLI | Linux server | 1.0 | 60 | Forgejo GPL, Renovate AGPL (internal) |
| Signing-secret vault | HashiCorp Vault, Doppler | Envelope encryption (per-org data key wrapped by Workers Secrets key), ciphertext in R2, decrypted only in build VM | Workers Secrets, R2 | 0.5 | 0 | |
| Store publishing (v2) | Capgo, Codemagic, Appflow | fastlane deliver/supply with customer's own ASC key / Play service account | Build farm | 1.0 | 0 | |
| Push (v2) | OneSignal, Pusher Beams | Own sender via Queues to APNs HTTP/2 + FCM HTTP v1 with customer's credentials | Workers, Queues | 1.5 | 0 | |
| Crash/WebView timing (v2) | Sentry, Datadog RUM | Plugin beacons into Analytics Engine, stack-hash grouping | Analytics Engine | 2.0 | 0 | |
| Billing & tax | Paddle, Stripe (kept: only external party) | Paddle MoR; entitlements in D1 via signed webhooks | Workers, D1 | 1.0 | 0 | 5% + $0.50/txn |
| DNS/TLS/WAF | Route 53 etc. | Cloudflare DNS, Universal SSL, WAF on buffersoltech.com zone | Cloudflare | 0 | 0 | |
| Base platform | - | Cloudflare Workers Paid | Cloudflare | 0 | 5 | |
| Total | | ~29.6 weeks total listed; extra in-house work beyond product ~ email 2 + plugin 3 + ops/monitoring/backups 2.5 + build farm 3 + abuse/search 1.3 | | 29.6 | 307 | |

Fixed infra ~$307/mo: Workers $5, ops server $60 (Hetzner AX42-class est.), 2 mail VPS $12, 2 probe VPS $12, backups $5, Linux build/CI server $60, Mac mini farm $153.26 (2 x $599 amortized 36 mo + $59.99 colo each).

### Integrations / APIs (sheet 18)
No API keys/paid services except Paddle. Everything else is the customer's own system (free) or infra we run.
- Paddle Billing API + signed webhooks (P0): only external paid party; 5% + $0.50/txn; merchant of record handles US sales tax, UK VAT, Canadian GST/HST (alt: Stripe via US LLC/Atlas). Needs Paddle account + API key + webhook secret.
- GitHub OAuth app and Google OIDC sign-in (P0): need our own OAuth client credentials (free); Google consent-screen verification.
- Customer IdP (Okta, Entra ID, Google Workspace) via SAML 2.0/OIDC (P1).
- Customer Slack/Discord incoming webhooks (P1); customer's Git repo/CI calling our CLI (P2).
- Customer App Store Connect API key (JWT) + Play Developer API service account via fastlane deliver/supply (P2); customer APNs/FCM credentials (P2).
- `@capgo/capacitor-updater` public self-hosted protocol: updateUrl, statsUrl, channelUrl; request/response fields version, url, checksum, session_key, message (P0; implement clean-room from public docs only).
- Capacitor core (MIT): bridge setServerBasePath / persisted serverBasePath; internal API may change in majors, test each release on Mac farm (P0).
- Cloudflare (our account): Workers, R2, KV, D1, Queues, Analytics Engine, DNS, WAF, Turnstile; Wrangler, OpenTofu, S3 API (P0). Needs Cloudflare account on paid Workers plan.
- Our servers (Hetzner, OVH, Mac colocation) over Ansible/SSH (P0); port 25 must be unblocked.
- Mailbox providers (Gmail, Outlook, Yahoo) via SMTP from our IPs; free dashboards Google Postmaster Tools, Microsoft SNDS (P0).
- fastlane (P1); MCP clients (customer's own agent) over stdio + HTTP (P0); Appflow/Capgo export by customer CLIs (P1).
- Banned (CI check must fail on these packages/outbound hosts): paid LLM/AI APIs, SMS/voice (Twilio, Vonage), email-sending services (Resend, Postmark, SES, SendGrid, Mailgun), auth SaaS (Clerk, Auth0, WorkOS, Firebase Auth), monitoring/analytics SaaS (Sentry cloud, PostHog cloud, Datadog, Better Stack, Checkly, LogRocket, GA, Plausible cloud), Algolia, managed DBs (Neon, Supabase, PlanetScale), paid CDNs (Bunny, Fastly, CloudFront), build services (Codemagic, Bitrise, Expo EAS, paid CI minutes), OneSignal, Akismet/OOPSpam/reCAPTCHA, data providers/scrapers/proxies, Google Fonts CDN, Capgo AGPL code or any file from `@capgo/capacitor-updater`. Record self-hosted OSS licences in THIRD_PARTY_LICENSES.md; egress allow-list on servers (only Paddle and customer-owned platform APIs).

Security build rules: argon2id API-key hashes, secrets in Workers Secrets, HMAC webhooks and relay calls, CSP, rate limits per key/IP, signed upload URLs, audit log on every mutation, admin UIs of self-hosted tools only behind WireGuard/Cloudflare Access, SSH keys only, unattended upgrades, gitleaks/Trivy/osv-scanner/Semgrep CE in CI, security.txt.
Testing: Vitest (manifest/signing/delta/bucketing), Miniflare + local D1, Playwright console, device E2E of plugin on iOS simulator + Android emulator on own farm, mail seed tests, k6 5K rps load test, axe, restore drill.
Deploy: Woodpecker CI: lint -> test -> licence/banned-dependency check -> wrangler deploy (staging on push to main, production on tag); drizzle-kit migrations before deploy.

Non-functional targets: update-check p95 < 80 ms; 5 MB delta p50 < 1.5 s on 4G; API availability 99.95% (99.9% SLA on Scale); update success > 95% (Capgo states 82%); RPO 24 h / RTO 4 h; OWASP ASVS L2 + external pen-test before Team launch; WCAG 2.2 AA; email DMARC pass >= 99%, bounce < 2%, complaints < 0.1%; MTTR < 30 min; margin >= 84% at 300 accounts.

## Pricing
All prices USD; UK buyers see GBP (VAT-inclusive) and Canadian buyers CAD at checkout (conversion rates not in workbook). Merchant of record: Paddle. Free trial: not in workbook (a permanent Free plan instead; no card). Capgo for comparison: no free plan, 14-day no-card trial.

| Tier | Our price | Limits | Capgo equivalent |
|---|---|---|---|
| Free | $0.00 | 500 MAU, 10 GiB fair use, 2 apps, 7-day events, community support | none |
| Solo (monthly) | $6.99/mo | 2,000 MAU, unlimited apps/members, 100 GiB fair use, 30-day events, 60 build min/mo | Solo $14 |
| Maker (monthly) | $19.99/mo | 10,000 MAU, 1 TB fair use, 60-day events, auto-pause rollouts, webhooks, 300 build min/mo | Maker $39 |
| Team (monthly) | $49.99/mo | 100,000 MAU, 10 TB fair use, 90-day events, SSO, priority email, 1,200 build min/mo | Team $99 |
| Scale (sales-assisted, annual contract) | from $124.99/mo | 1M MAU, 99.9% SLA, DPA, dedicated Slack, self-host worker licence | Enterprise $249 |
| Solo annual | $5.99/mo (billed $71.88/yr) | as Solo | $12 |
| Maker annual | $16.99/mo (billed $203.88/yr) | as Maker | $33 |
| Team annual | $41.99/mo (billed $503.88/yr) | as Team | $83 |
| Scale annual | $103.99/mo | as Scale | $208 |

- Extra MAU: $0.0015 per MAU on any paid plan (billed only with confirmation; caps set by customer; overage 3 months running suggests upgrade). Capgo credits est. $0.003/MAU.
- Bandwidth beyond fair use: $0.03/GiB, only above 10x plan allowance. No bandwidth meter otherwise.
- Extra build minutes: prepaid credits at $0.03/min.
- "Annual = 2 months free" is the workbook's marketing line. Workbook also lists "3 months free on annual" as an Appflow-refugee switch offer (competitor sheet) and a 20% recurring credit agency partner program, plus referral: 1 free month for both sides.
- Limit behavior: no seats; unlimited apps/members on paid plans; hitting the limit pauses new downloads but the app keeps current version; card declined = 7-day grace.
- Upgrade triggers: Free -> passes 500 MAU or needs rollouts/auto-pause; Solo -> second app or >2K MAU; Maker -> >10K MAU or SSO; Team -> >100K MAU, SLA, security questionnaires.
- Unit economics (est.): blended ARPU $17.50, ~84% gross margin at 300 accounts, break-even 20 accounts, free account cost ~$0.013/mo; 79% margin in the stress test if R2 egress were not free.

## Competitors
Prices are monthly list prices seen 3 Nov 2026 unless stated.

| Name / URL | Pricing | Strengths | Weaknesses | How we beat them |
|---|---|---|---|---|
| Capgo (leader) https://capgo.app/pricing/ | PAYG $5 credits; Solo $14 (2K MAU, 100 GiB) / Maker $39 (10K MAU, 1 TB) / Team $99 (100K MAU, 10 TB) / Enterprise from $249 (1M MAU); yearly $12/$33/$83/$208 | Most-used Capacitor OTA; open-source plugin (MPL-2.0, ~880 stars); native builds, Observe, push, MCP; SOC 2 Type II, ISO 27001; DR 61 SEO machine | ~47% margin (manifest figure); 2026 CVEs incl. auth bypass + past data exposure (shouldiuse.io); complex options; 82% update success rate; bandwidth meter; no free plan | Half price, no bandwidth meter, security-first, builds included, migration endpoint |
| Capawesome Cloud https://capawesome.io/cloud/pricing/ | Live Updates (yearly) $9/$29/$79/$249 (1K-250K MAU); Platform $19/$49/$149/$499 | Ionic's official Appflow partner; German (GDPR); code signing, protected channels, Cloud Runner builds | Closed backend; plugin reports no device events (per Capgo guide); fixed rollout steps 10/25/50/100; SSO only $499 | Per-device observe on all plans, any rollout %, SSO on Team |
| OtaKit https://www.otakit.app/ | Free 5K updates/mo; Starter $10 (100K updates); Pro $25 yearly / $50 monthly (1M); Enterprise custom | Cheapest; free tier; MIT; Cloudflare edge; ES256-signed manifests; MCP | Short track record; no native builds; small team; per-update pricing pricey for daily releasers | Deeper release control, builds, flat MAU pricing |
| Ionic Appflow https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products | closed to new customers since 11 Feb 2025; historically from $499/mo | First-party heritage | access ends 31 Dec 2027 | Import tool, migration guide, 3 months free on annual |
| Expo Update (EAS) https://expo.dev/pricing | Free (1K MAU) / Starter $19 (3K) / Production $199 (50K) / Enterprise custom; extra MAU billed | Best-in-class RN DX | Not for Capacitor | Price anchor only ("OTA for 100K users: $49.99 vs $449+") |
| Self-hosting capacitor-updater https://capgo.app/docs/plugin/self-hosted/handling-updates/ | free software + hosting | Full control | you own uptime, signing, rollouts, stats | Free tier + export/self-host story |

Visual/design style of competitors: Capgo = dark slate side nav, azure highlight, teal accents, white cards, Inter, DaisyUI ("Release Control Room" per their DESIGN.md); Capawesome = marketing feature grids, emoji-like icons, bright gradients, standard admin table console; OtaKit = minimal white dashboard, dense tables, plain event log; Expo = polished black-and-white, big type, lots of whitespace.

Feature parity highlights (Capgo / Capawesome / OtaKit): percentage rollout any % (Yes/Partial/No), auto-pause (Yes/No/No), native-compat check (Yes/No/Yes), failure grouping (Yes/No/No), native builds (Yes/Yes/No), free plan (No/No/Yes), audit log (Yes/Partial/No), SSO (Yes/Partial/No). Full sheet 05 lists ~35 features with our release phase.

## Design direction
Defined in workbook (sheets 19-21): "the signal box".
- Concept: railway signal-box mimic panel. Channels = horizontal tracks; bundles = "trains" with a 4-character headcode (e.g. 2K47) on an enamel plate; devices = stations; rollout = signal with red/amber/green aspects (arm angle = rollout %); rollback = train reverses into a siding. Mood: dependable, mechanical, legible, calm, exact. Avoid rockets/space/generic deploy clouds, playful/hype/neon.
- Palette (light): primary #1E5B3F (hover #174A33), ink #16201B, ink-muted #4F5D55, bg #F6F7F4, surface #FFFFFF, soft #EAF1EC, border #D3DAD5, track #2B3530. Lamps: green #2E9E5B, amber #E0A21B (never white text), red #C8372D, white #F4F1E6 (route set on dark), info #2C6E91, focus #E0A21B 3 px ring.
- Dark ("night shift", default follows OS): bg #0F1412, surface #18201C, ink #E6ECE8, ink-muted #9AA89F, primary #4FB585, border #2A3530, track #5D6B63; lamp glow `0 0 8px currentColor` at 40%.
- Typography: display Barlow Condensed (500/600), body Atkinson Hyperlegible (400/700), mono Red Hat Mono (400/500); self-hosted woff2 subsets (SIL OFL) served from /fonts, no Google Fonts CDN. Scale: display-xl 48/52, display-l 34/40, title 22/28, body 15/22, ui 14/20, small 12/16, headcode 18/18 600 tracking 0.08em.
- Spacing/shape: 4 px grid (4, 8, 12, 16, 24, 32, 48, 64); radius sm 2, md 4, pill only for lamps; 1 px hairline borders, 3 px track border; two elevation levels (drawer shadow `0 8px 24px rgba(22,32,27,0.16)`); 32 px table rows; breakpoints 480/768/1024/1440 (track view becomes vertical list < 768).
- Motion: 120 ms lamp cross-fade, 240 ms train/drawer (cubic-bezier(0.2,0,0,1)); no bounce; reduced-motion = opacity only. Optional "bell code" tick on auto-pause (off by default).
- Layout: left app/channel rail; center track diagram (all channels stacked); right inspector drawer; tables one click below. Nav: Org switcher -> App -> tabs Line, Bundles, Devices, Events, Settings; command palette `/` (release, rollback, find device). Mobile console usable for incidents (big Reverse button).
- Icons: Lucide-style 1.5 px stroke, 20 px, plus custom signal post, points, buffer stop, headcode plate. Imagery: no stock photos; schematic track drawings; marketing hero = live animated mimic panel (static SVG fallback).
- Dataviz: adoption as stepped line on timetable grid; failures as red ticks on track; no donuts/rainbow.
- Accessibility: status always colour + glyph + text (● G, ▲ A, ■ R); WCAG 2.2 AA; keyboard release flow.
- Do not: purple-blue gradients, Inter/Space Grotesk/Roboto, emoji section markers, identical rounded card grids, AI sparkle icons, cream+terracotta, glassmorphism, rockets, Capgo azure/teal/slate palette, layouts, logo or "Release Control Room" phrase.
- Tokens: create `packages/ui/tokens.css` (`--color-primary`, `--color-ink`, `--color-bg`, `--color-soft`, `--lamp-green/amber/red`, dark under `[data-theme=dark]` and prefers-color-scheme); Tailwind names primary, ink, bg, surface, soft, lamp-green, lamp-amber, lamp-red, track.
- Components: Track, Train (headcode plate), Signal, Station counter, Inspector drawer, Command palette, virtualised DataTable, Meter (gauge with lamp at 90%).
- Screens (sheet 21): marketing home, pricing (MAU calculator + dated vs-Capgo column), compare pages, compliance guide, docs, sign in/up, onboarding checklist, Line (track view), bundle detail, release dialog, devices, events, settings (keys & signing, members, billing & usage, webhooks), builds (v1), emails (welcome, 90% usage, auto-pause alert). Each has empty/loading/error states and a signature detail in the workbook.

## Landing page copy material
Voice: calm senior release engineer; short sentences, real numbers, no hype; slightly dry railway humor sparingly; US English. No exclamation marks, "blazing fast", "revolutionary".
- Headline: "Fix your Capacitor app today. Not after review."
- Subhead: "Live updates with rollouts, auto-pause and one-click rollback. Same core features as Capgo, about half the price. Built for US, Canadian and UK mobile teams by BufferSol Technologies."
- Pricing headline: "Half the fare. Same line." Detail line: "Same features, half the fare" with source date; show leader price + date beside ours.
- Reassurance: "No bandwidth meter. No seats. Hit your limit and your app keeps running; we pause new downloads and ask."
- Compliance line: "Web layer only. Native changes still go through the stores. We block native files at upload."
- Migration line: "Already on @capgo/capacitor-updater? Change three URLs."
- Value props: live updates in minutes; percentage rollouts with auto-pause; one-click rollback + on-device auto-rollback; native-compatibility check; signing on by default; delta updates; unlimited apps and members; audit log on every plan; MCP server for AI agents; free plan (500 MAU); no third party in your update path; own MIT plugin; native builds on our own Mac/Linux farm (v1); event dashboard with device lookup.
- Objections/FAQ: "Is OTA allowed by Apple/Google?" (Apple Guideline 2.5.2 plus Developer Program License Agreement carve-out for interpreted JS run by WebKit/JavaScriptCore that doesn't change the app's primary purpose; 2.3.1 bans hidden features; Google Play Device & Network Abuse policy exempts "JavaScript in a webview"; never say "Apple approved"). "Can I self-host the plugin for free?" (free tier + export + edge worker self-host later). "Will you be around in 2 years?" (not answered in workbook; build trust via BufferSol company page). "SOC 2?" (not available yet; offer security page, signing, audit log, pen-test, bug bounty, DPA). "What if I hit my limit?" (app keeps working). "Data separation between clients/who owns account on exit?" (org transfer, export). "Why half price?" (own infra, R2 zero egress, deltas).
- Proof points (use only what is verified): Capgo makes $33K MRR shipping JS to phones (TrustMRR); Capacitor monthly npm downloads 1.5M (Jan 2023) to 18.5M (Sep 2026); Appflow ends 31 Dec 2027; CodePush retired 31 Mar 2025; target update success > 95% vs Capgo's stated 82%; p95 < 80 ms update check (target). No customer case studies exist yet (case study "Agency X" in the content plan is a placeholder "after beta"; do not fabricate).
- Microcopy: onboarding "Waiting for your app to check in... Open the app on a device built with the plugin."; empty state "No trains on this line yet. Run `npx @buffersol/hotrail upload`."; signature error "This bundle isn't signed with the key your app trusts. Re-upload with --sign, or rotate keys in Settings."; native mismatch "12,408 devices run native build 1.8.0, which lacks @capacitor/camera 8.2. They'll stay on 2K46 until you ship a store build."; auto-pause email subject "Rollout of 2K47 paused at 25%: 4.1% failures"; usage email "Your app is at 90% of 10,000 MAU"; welcome email "Your first update is one command away"; cancel "Sorry to see you go. Your export is ready, and the Free plan keeps 500 devices updating."
- Trade dress: comparison pages must be factual, dated with "last checked" stamp and links; never use Capgo's logo, colors, copy; never claim "better than Capgo" without proof.
- SEO keywords/pages: Capgo alternative; Ionic Appflow alternative for live updates; CodePush alternative for Capacitor and Cordova; Capacitor live updates; Capacitor live update cost calculator; are OTA updates allowed by Apple and Google; delta updates for Capacitor; vs Capawesome; vs OtaKit; Appflow migration; self-hosting capacitor-updater. Use llms.txt and "Copy for agent" in docs.

## Go-to-market / launch notes
Channels (week 0 = public launch): SEO comparison pages vs Capgo/Capawesome/OtaKit/Appflow/CodePush with dated tables (weeks -2 to 4; goal top-10 for "Appflow alternative" in 3 months, est.); compliance guide; Reddit r/capacitor and r/ionic helpful answers + launch post with migration guide (50 sign-ups est.); X/LinkedIn build-in-public ("OTA at ~85% margin", "we run our own mail, error tracker and Mac build farm, about $300 a month"); Product Hunt launch at week 1 with animated signal-box demo (top 10 est.); Show HN week 2 (open edge worker + write-up); Ionic/Capacitor Discord and forum (Appflow migration guide, deadline 31 Dec 2027); agency partner program (20% recurring credit, multi-org console; 10 agencies in 6 months est.); AI-builder communities (Lovable-to-App-Store tutorials); YouTube walkthroughs; paid search test $300/mo ("Appflow alternative", "Capacitor live update"; CAC < $60 est.); waitlist + onboarding drip from own mail servers on separate marketing subdomain/IP with one-click unsubscribe (40% activation target).
Launch content plan: 28 pieces (X threads, LinkedIn posts/carousels, IG/TikTok reels, Reddit guides, YouTube tutorials, SEO articles, calculator tool, dev.to/Hashnode infra deep dive). Every comparison shows date checked and a link.
KPIs (est.; month 1 / month 6): sign-ups 150 / 1,500 cumulative; activation (>=1 applied event in 7 days) 35% / 50%; paying accounts 10 / 120; MRR $150 / $2,100; free-to-paid 5% / 8%; gross margin n/a / >= 85%; update success > 93% / > 95%; p95 check < 100 ms / < 80 ms; rollback < 2 h / < 1 h; logo churn < 6% / < 3%; Appflow/Capgo migrations 3 / 40; open high/critical vulns 0; on-call pages < 8 / < 3 per month.
Roadmap: wk1 foundations; wk2 own infra baseline (mail, ops, probes, backups); wk3 upload pipeline; wk4 update API + migration endpoint; wk5-7 own plugin; wk8 channels/rollouts; wk9 observe + console design; wk10 billing/limits/abuse; wk11 launch prep (docs, compare pages, MCP, status page, runbooks); wk12-14 v1 build farm; wk15-16 v1 teams (SSO, passkeys, import, preview app); wk17-24 v2.

## Risks / compliance notes
- Supply-chain: compromise could push code to customers' users (Low/High): mandatory signing with customer-held keys, offline root key on hardware key, 2FA, audit logs, pen-test, bug bounty, upload anomaly alerts.
- Apple/Google tighten OTA rules (Low/High): web-only payloads, native-file blocker, compliance docs; ToS forbids changing app purpose or hidden features; review compliance page twice a year. Apple limits to 2 macOS VMs per Mac mini (farm scheduler hard limit).
- Licence contamination (Low/High): do NOT read or copy code from github.com/Cap-go/capgo (AGPL-3.0) or github.com/Cap-go/capacitor-updater (MPL-2.0). May implement the public HTTP contract from Capgo's self-hosting docs for interoperability. Our plugin is clean-room MIT on Capacitor core. Self-hosted AGPL tools (Grafana, Loki, Renovate) unmodified and internal only; SBOM (Syft) + licence check in CI.
- Trademark: "Hotrail" screened only (web + USPTO via Justia/Trademarkia/Furm, 3 Nov 2026; only dead marks found); formal USPTO/UKIPO/CIPO clearance (classes 9 and 42) before launch. Rejected names taken: LiveRail, ReleaseRail, ShipLive, NowShip, Pushline.
- Capgo price war (Medium/Medium) or protocol change breaking migration endpoint (Medium/Low): lower COGS, annual lock-ins, own plugin default, pin tested plugin versions.
- Email deliverability / port 25 blocking (Medium/High): two mail servers on two providers, SPF/DKIM/DMARC/MTA-STS, 6-week warm-up, transactional only, VERP suppression, magic link also shown as in-app code; request port-25 unblock before launch.
- On-call load: one founder runs mail, ops, probes, build farm (High/Medium): hot path edge-only and fail-safe, tuned alerts, runbooks, BufferSol backup engineer.
- Unpatched self-hosted software (Medium/High): Ansible images, unattended upgrades, monthly bumps, admin UIs behind WireGuard/Cloudflare Access, Trivy.
- Platform API changes on free interfaces (Medium/Medium): nightly contract tests, feature flags.
- Cloudflare terms/pricing change (Low/Medium): fallback origin on own OVH servers (margin ~79% per stress test); nightly off-Cloudflare copies. Large-file delivery must be served from R2 within Cloudflare service-specific terms (legal review).
- Mac farm failure/capacity (Medium/Medium): N+1, spare unit, add Mac when utilisation > 35%.
- Backup/restore failure (Low/High); abuse (malicious bundles, phishing via mail) (Low/High); event storage cost spike (Medium/Low); crowded market (High/Medium); churn of small indie apps (High/Low).
- Privacy: CCPA/CPRA, UK GDPR, PIPEDA; minimal device data (random device ID, app version, OS, platform; no IP stored); we are processor; no sub-processors except Paddle; DPA available; US data hosting by default; no sale/sharing of personal data; event retention 7/30/60/90 days by plan.
- Security tenant isolation: 0 cross-tenant reads, lint rule bans raw queries outside data-access layer. Accessibility WCAG 2.2 AA (axe in CI).

## Anything else a builder must know
- Hard rule: zero third-party APIs in the delivery path; CI must fail on banned packages/outbound hosts. Only Paddle is an external party; customer-owned platform APIs are allowed with the customer's credentials.
- Hot path must never touch D1 or our own servers; an ops-server outage must never stop updates (chaos test: block D1 and ops server, app still boots and updates from cache).
- Never break installed apps: at any limit or error, devices keep their current bundle.
- MCP server needs no LLM on our side; release via agent requires explicit confirmation.
- Protect last 3 bundles per channel from retention deletion; soft-delete 7 days.
- Native files (.so, .dex, .jar, .dylib, .framework) are rejected at upload; zip-bomb scan.
- Build farm: Mac minis may run at most 2 macOS VMs each; signing secrets decrypted only inside the ephemeral VM; 60 min timeout; retry on another host if VM fails to boot.
- Workbook oddities/gaps to resolve: (1) our free trial for paid plans: not in workbook; (2) Free plan lists "2 apps" while the offer text says unlimited apps (applies to paid plans); (3) "annual = 2 months free" vs actual annual prices ($71.88 vs $83.88 monthly-equivalent, roughly 14% off, closer to 1.7 months free); (4) data model says events in Analytics Engine/ClickHouse "not Postgres" (stack uses D1, no Postgres); (5) Scale price is "from $124.99" with annual $103.99, custom contract; (6) GBP/CAD prices and exchange rates not in workbook; (7) Capgo's 47% gross margin comes from a scouting manifest, not visible on TrustMRR; the $0.003/MAU + $0.06/GiB Capgo credits rate is an unverified third-party blog quote; (8) hosting costs are estimates (Hetzner prices rose in 2026); (9) no customer testimonials or case studies exist yet.
- Sheets of the workbook not reproduced in detail here: 05 Feature Parity (full matrix), 07 Unit Economics (formula inputs), 20 Design Tokens (full list), 29 Sources (36 URLs, all accessed 3 Nov 2026). Key sources: trustmrr.com/startup/capgo, capgo.app/pricing, capawesome.io/cloud/pricing, otakit.app, developer.apple.com/app-store/review/guidelines, support.google.com/googleplay/android-developer/answer/16559646, ionic.io Appflow announcement, Microsoft App Center retirement page, Cloudflare R2/Workers pricing pages.
