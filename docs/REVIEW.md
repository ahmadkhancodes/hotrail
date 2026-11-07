# Hotrail pre-launch review (M5, 7 Nov 2026)

Scope: update safety, tenant isolation, security, billing, claims, accessibility, ops readiness. I read the code; I did not rely on PROGRESS. Nothing was deployed.
Ranks: **P0** must be fixed before launch (all fixed in this change, each with a test that failed before the fix), **P1** should be fixed before or soon after launch, **P2** later.
Tests for the fixes: `tests/unit/m5-review.test.ts`, `packages/plugin/test/updater.test.ts` ("store update"), `packages/cli/test/cli.test.ts` ("M5 review").

## P0 (all fixed)

| # | Area | Where | Failure scenario | Fix |
|---|---|---|---|---|
| P0-1 | Upload policy | `src/lib/ship/upload.ts:219` | `POST /api/v1/bundles` checked the files listed in the zip's central directory but stored and served the **customer's original bytes**. A crafted zip can hide local entries from the central directory, such as an ELF `lib/evil.so`, a `../` name or a symlink. Device unzippers that stream local headers (Android `ZipInputStream`, the stock Capgo plugin) extract them. That bypasses the native-file policy that the store-policy pages promise. | Devices now get a zip the server rewrites from the inspected entries (`writeZip(files)`). The CLI path already did this. |
| P0-2 | Isolation / takeover | `src/app/api/account/route.ts`, `src/lib/ship/pointers.ts:96`, `src/lib/ship/apps.ts:27` | Deleting an account deleted the app records but left the R2 pointers. That freed the globally unique Capacitor app id. Any other org could then upload under `com.victim.app` and overwrite `ptr/com.victim.app/index.json`. Every still-installed copy of the victim's app would then run that org's JavaScript (unsigned apps, or managed apps without `publicKey` in the plugin). | `retireAppPointers` runs before the org's data is deleted. It writes a tombstone index, so devices get no update, and removes the channel pointers. `ensureApp` refuses an app id whose pointer namespace already exists (409 `app_id_taken`, "contact support"). The same guard covers orgs deleted through Better Auth directly. |
| P0-3 | Rollback / pause safety | `src/lib/ship/pointers.ts:80` | `publishPointers` reads the whole app state and then rewrites every pointer. Publishers run concurrently: a release, an auto-pause triggered by a beacon, the limits sweep, a device channel change. A publisher that read before a pause or rollback but wrote after it put the old state back. The pointer said "not paused" while the DB said "paused", so the bad bundle kept shipping. | After writing, the publisher recomputes the state and writes again if it changed (up to 5 passes). The last writer always holds state read after the last change. The test stalls a publisher mid-write while a pause lands. |
| P0-4 | Native compatibility on device | `packages/plugin/src/updater.ts:86,113` | The plugin kept the confirmed OTA bundle across a **store update**. The new native build (new plugins, new Capacitor) went on loading web code built for the old native layer. That can break every user who updates from the store, and server-side compatibility checks can't undo a bundle that is already installed. | The state records `nativeBuild`. On launch with a different `versionBuild`, every downloaded bundle is removed, the plugin goes back to the built-in assets and reloads once. The beacon is `reset_native_change`, which is classified "other" so it never counts toward auto-pause. Native (Swift/Kotlin) still has no own check; see P1-12. |
| P0-5 | Ops / data loss | `src/lib/storage/index.ts:29` | With the R2 variables missing or incomplete, production silently used a **per-instance memory store** next to Mongo. Bundles and pointers vanished on cold start while Mongo still listed them, and each serverless instance served different pointers. | Production throws `bundle store not configured` unless R2 is complete. All-memory demo mode (`DB_DRIVER=memory`) and an explicit `BUNDLE_STORE=memory` are still allowed. |
| P0-6 | Claims: migration | `src/content/docs/migrating-from-capgo.ts:29`, `plugin.ts:27`, `quickstart.ts:26` | The headline "change three URLs" docs pointed at `/api/updates`, `/api/stats`, `/api/channel` and `/api/v1/updates/{{app id}}`, none of which exist. A migrating customer's devices would get 404s and never update. | All three docs now use `/api/v1/updates/check`, `/stats` and `/channel`. |
| P0-7 | Claims: plan contents | `src/config/product.ts:110`, `src/content/compare.ts:54` | The Team plan was sold with "SSO", and the compare page said "Team plan and up". No SSO code exists. | Changed to "Priority email (SSO coming in v1)" and "Coming in v1 (not available yet)". |
| P0-8 | Claims: placeholders and offers | `src/app/(marketing)/page.tsx:58,64,157` | Public FAQ showed `{{company page URL}}` and `{{confirm min version}}`. The landing page promised an unconfirmed "3 months free" Appflow offer. | The company-page sentence and the unconfirmed offer are removed. The version answer now states what the code needs (plugin peer `@capacitor/core >= 6`). The legal placeholders (`{{jurisdiction}}`, `{{registered address}}`, `{{cap}}`, `{{refund policy}}`) are owner facts and stay in MANUAL_STEPS 9, now marked launch blocking. |
| P0-9 | Ops: health | `src/app/api/health/route.ts` | `/api/health` always answered `ok: true`, so probes could not see a Mongo outage. | It now runs one indexed read with a 2 s timeout (`src/lib/health.ts`) and returns 503 with `db.error` when it fails. |

## P1 (fixed in this change, small and safe)

- **P1-1 Unauthenticated pointer republish** (`src/lib/ship/device.ts`, `src/app/api/v1/updates/channel/route.ts`).
  - **Scenario:** every `POST` and `DELETE /api/v1/updates/channel` rewrote all pointers, even when nothing changed. Anyone with the public app id could loop it, cost R2 writes and contend with real releases (R2 limits writes per object).
  - **Fix:** a no-op write returns early, and writes are limited to 30 per minute per IP.
- **P1-2 Admins could not create or delete API keys.**
  - **Scenario:** Better Auth checks `apiKey:create/update/delete`, but our roles only granted `read/manage`. The UI offered admins the button and then failed.
  - **Fix:** roles now grant those actions (`src/lib/auth/roles.ts`).
- **P1-3 CLI sent the API key wherever `hotrail.json` said, over http too** (`packages/cli/src/cli.ts`). It now requires https, with http allowed for localhost only.
- **P1-4 CLI followed symlinks and shipped secrets** (`packages/cli/src/project.ts`).
  - **Scenario:** `--dir .` or a stray file published `.hotrail/signing-key.json`, `.env*`, `.git` or symlink targets in a public bundle.
  - **Fix:** they are now skipped, using `lstat` with no follow. `.well-known` is kept.
- **P1-5 Upload URL secret fell back to `"dev-upload-secret"` in production** (`src/lib/ship/context.ts`). It now throws if `BETTER_AUTH_SECRET` is missing.
- **P1-6 False doc and pricing claims:**
  - "successes are sampled at 10 percent": every outcome is stored (`rollouts.ts`).
  - "extra MAU can be added at $0.0015 with your confirmation": overage is reported and not charged yet (pricing FAQ).
- **P1-7 `.env.example` had `APP_NAME=postslot` and `MONGODB_DB=postslot`.** Copied to Vercel, that would write under another app's tenant key. Both are now `hotrail`.

## P1 (open)

| # | Where | Failure scenario | Fix |
|---|---|---|---|
| P1-8 | `src/app/api/v1/updates/check/route.ts:32`, `src/lib/ship/metering.ts:15` | MAU is counted from unauthenticated checks. A script sending random `device_id`s for a victim's public app id pushes them to 100% MAU, which pauses their downloads. It also inflates overage. | Count a device only once it sends a beacon from a known native build, or rate-limit new devices per IP and app. Alert on new-device spikes. |
| P1-9 | `src/app/api/v1/updates/stats/route.ts:15` | Beacons are unauthenticated and limited only per device id. Forged `*_fail` beacons with random device ids can auto-pause a customer's channel. The failure mode is safe, but it is a denial of rollouts. | Count only devices that recently got that bundle from `check` (a per-bundle download token in the check response), plus a per-IP limit. |
| P1-10 | `src/lib/ship/native.ts:32` | An app with no recorded store builds and no `--native-builds` gets **no compatibility check**. A bundle that needs a newly added native plugin reaches old builds. | Docs already describe `hotrail native register`. Make the CLI warn when the bundle fingerprint differs from the previous bundle's and no builds are recorded, and consider making `native register` part of `init`. |
| P1-11 | `packages/core/src/update.ts:53` | During a staged rollout, devices outside the bucket get "no update" instead of the previous bundle. New installs at 10% stay on the store's built-in assets instead of the stable release. | Add `previous` to the pointer and serve it to out-of-bucket devices. |
| P1-12 | `packages/plugin/ios/.../HotrailUpdaterPlugin.swift:134`, `.kt:442` | Native code has no `versionBuild` reset (P0-4 is the JS half; the first launch after a store update still loads the old bundle once before JS resets it). A missing bundle dir makes native fall back silently while JS still names that version. A white-screen bundle (no JS runs) needs two cold starts to revert. | Store `versionBuild` natively and reset before loading. Report a missing dir as a native revert. Check `index.html` before `setBundle`. Treat the reload in `setBundle` as the first boot. Needs the first plugin CI run (MANUAL_STEPS 12). |
| P1-13 | `packages/plugin/src/updater.ts:214` | A transient `checksum_fail` or `unzip_fail` (captive portal, truncated transfer, full disk) blacklists that version on the device forever. | Blacklist immediately only on `signature_fail` and `manifest_fail`; retry the others up to 3 times. |
| P1-14 | `packages/plugin/src/updater.ts:96` | An unconfirmed trial that is killed by the OS (background strategy) is reverted and blacklisted on next launch, even if the bundle is fine. | Count a boot only after a foreground run, and expire `failed` entries after N days. |
| P1-15 | `src/lib/ship/upload.ts:101` | There is no signing-key rotation. A leaked **upload** key on an app without a key can register the attacker's public key and lock the owner out of signed uploads. | Make the first key registration require the `all` scope, and add a rotation endpoint (old key signs the new one). |
| P1-16 | `src/lib/webhooks/outbound.ts:113` | The SSRF guard checks the hostname only. A DNS name that resolves to a private address, or a later rebinding, passes. | Resolve and check the IP at send time (or use an egress proxy), and block 100.64/10. |
| P1-17 | `src/lib/storage/r2.ts:35` | The hot path reads two R2 objects over the S3 API with no timeout and no cache. Latency is well above the 80 ms target, and a slow R2 hangs device requests. | Add an in-process cache (2 to 5 s TTL) and a fetch timeout in `storePointerReader`, or move pointers to the CDN host or KV. |
| P1-18 | `src/lib/db/index.ts`, `src/lib/env.ts:39` | Production without `MONGODB_URI` and without `DB_DRIVER` silently uses the memory DB. It was not changed here because `next build` runs with `NODE_ENV=production` and no DB. | Set `DB_DRIVER` explicitly on every Vercel environment (MANUAL_STEPS 13). Then make the implicit fallback throw at request time. |
| P1-19 | `src/lib/db/mongo.ts:15` | `serverSelectionTimeoutMS: 8000` with no socket timeout means a Mongo outage makes the console, stats and auth hang about 8 s per request. The update check itself does not depend on Mongo. | Use 2 to 3 s plus `socketTimeoutMS`. |
| P1-20 | `scripts/ensure-indexes.ts` | Better Auth `session.userId`, `account.userId`, `invitation`, `twoFactor` and `passkey` have no indexes, and the `rateLimit` collection has no TTL. Index creation is manual on every release. | Add the indexes and run `db:indexes` in the deploy script. |
| P1-21 | Accessibility: `src/app/globals.css`, `app-shell.tsx:105` | Light focus ring is amber on white, about 2.3:1 (needs 3:1). `text-success` on white is 3.4:1. The app shell's mobile menu dialog does not move or trap focus or return it. | Darken both tokens, and reuse the marketing header's focus handling. |
| P1-22 | Claims: `src/app/(marketing)/page.tsx` hero, FAQ | "Same core features as Capgo" (SSO, native builds, SOC 2 and a device-tested plugin are missing). "Export bundles, manifests and events" (events are not exported). The pricing table compares a yearly total with Capgo's monthly price. | Reword (owner copy decision; logged). |

## P2

- `src/lib/ship/router.ts:84`: the signed blob PUT reads the body before checking the signature. Check the signature first.
- `src/lib/auth/index.ts:68`: the 5 minute session cookie cache means a revoked session works for up to 5 minutes. Org API keys survive member removal (by design; say so in the docs).
- `src/lib/webhooks/outbound.ts`: endpoints are never disabled after repeated failures (the brief says 50).
- R2 custom domain makes every key public, including `ptr/` (override device ids) and `pending/`. Serve only `zips/`, `manifests/` and `blobs/` from the CDN (a Worker or a separate bucket).
- `packages/core/src/manifest.ts:22`: paths that differ only in case (`A.js` and `a.js`) collide on case-insensitive iOS filesystems. Reject case-folded duplicates.
- Plugin: `safeName(".")` and a manifest path `"."` resolve to the bundles root. Native `removePath` should refuse the root. Native `download` accepts `http:`. `hashFile` and copy `src` are not confined to the bundles root.
- First-come app id claims: someone can squat another company's app id. A support process to release ids is needed (pairs with P0-2).
- Bundle delete guard: the "last 3 bundles per channel" rule from ARCHITECTURE is not enforced (live and rollback target are).
- Accessibility: `button` size `sm` is 32 px (CopyButton). The org switcher uses listbox roles with no arrow keys. The Line view's `aria-label` differs from the visible text. Transitions are not cut under reduced motion.
- Claims: the Capgo "bandwidth meter" row isn't sourced in the brief. "Our own edge code" doesn't match the architecture (the hot path is Node). `kill_switch` is never emitted by the server. "1 to 100" vs "0 to 100" percent.
- MCP: `upload` accepts any local `dir`/`zipPath` (prompt injection could upload local files; nothing is released). `writeZip` has no zip64 guard.

## Verified and fine

- **Ed25519:** manifests signed over canonical JSON (sorted keys). The signature binds `appId` and `version`, and the plugin checks both. Signed-only mode applies when `publicKey` is set. Managed keys are sealed with AES-GCM using the app id as AAD.
- **Hot path:** `/api/v1/updates/check` never reads Mongo before answering. Every error returns 200 "no update". Sticky bucketing is a SHA-256 of `device:channel`. When builds are recorded, the native allow list is enforced and an empty enforced list refuses everyone.
- **Tenancy:** every `/api/v1/*` route goes through `requireApp`, which checks the org, and another org's app id answers 404. The webhook, audit, billing and overage routes are scoped to `ctx.org.id` with role checks. Cookie writes have an Origin check, and key requests skip it.
- **MCP:** release and rollback need `confirm: true` (zod boolean plus a strict `=== true`).
- **Stripe:** the webhook verifies the signature on the raw body, records the event id only after success (idempotent), and recomputes from Stripe. No client value grants a plan, and checkout lookup keys come from the server catalog.
- **Usage emails:** sent once per threshold per period (`ifAbsent` flag). At 100% only new downloads pause (`limited`).
- **Zip handling:** central-directory sizes are checked before inflate, inflate is capped at the declared size, zip64 and encrypted entries are refused, paths are normalised, and ratio and count limits apply. Plugin native unzip is zip-slip safe on both platforms (sub-review; not compiled here).
- **Native-file policy:** checked by extension and by magic bytes. Finalize re-hashes every blob.
