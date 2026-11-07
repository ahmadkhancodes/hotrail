# Manual steps for Hotrail (owner-only; deep link first). None block Phase 0 or M1; the build uses stubs until each is done.

1. **npm scope and token** (needed from M2, to publish `@buffersol/hotrail*`)
   https://www.npmjs.com/org/create → create org `buffersol` (free, public packages), then https://www.npmjs.com/settings/~/tokens → Generate New Token → Granular, read+write, packages `@buffersol/*`, bypass 2FA for CI.
   Paste the token as GitHub Actions secret `NPM_TOKEN` on ahmadkhancodes/hotrail: https://github.com/ahmadkhancodes/hotrail/settings/secrets/actions/new
   Done when: the secret lists as `NPM_TOKEN`.

2. **GitHub OAuth app** (sign in with GitHub, M1)
   https://github.com/settings/applications/new → name "Hotrail by BufferSol", homepage `https://hotrail.buffersoltech.com`, callback `https://hotrail.buffersoltech.com/api/auth/callback/github`.
   Provide client id + secret as env `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
   Done when: sign in with GitHub works on the live site.

3. **Google OAuth client** (M1)
   https://console.cloud.google.com/apis/credentials → Create OAuth client ID → Web; origin `https://hotrail.buffersoltech.com`, redirect `https://hotrail.buffersoltech.com/api/auth/callback/google`. Env `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Consent screen verification needed before public launch.

4. **Cloudflare token with R2 + DNS edit** (M2; part of `CLOUDFLARE_SAAS_TOKEN`)
   https://dash.cloudflare.com/profile/api-tokens → permissions: Account R2 Edit, Workers Scripts Edit, Zone DNS Edit (buffersoltech.com). I create the buckets, custom domain `hotrail-cdn.buffersoltech.com` and the cron worker myself once it exists.

5. **Resend key + sending domain DNS** (M1/M4; env `RESEND_API_KEY`)
   https://resend.com/domains → add `mail.buffersoltech.com` (I add the DNS records via the Cloudflare token).

6. **Vercel Pro** before taking real money (not before launch of the free plan): https://vercel.com/account/billing → upgrade the new account's team. Hobby is non commercial.

7. **Trademark clearance** for "Hotrail" (USPTO/UKIPO/CIPO classes 9 and 42) before public launch. Legal step; I can prepare the search sheet.

8. **Stripe live mode + tax** at go live: https://dashboard.stripe.com/settings/tax (test mode is enough for the build; live keys are the owner's).

9. **Legal placeholders: LAUNCH BLOCKING** (owner facts; flagged as `{{...}}` in the shipped pages until filled; M5 removed the marketing ones)
   - `{{jurisdiction}}` and `{{registered address}}`: `src/config/product.ts` (`legal`), used by terms, privacy, DPA.
   - `{{cap}}`: liability cap in `src/content/legal/terms.ts`.
   - `{{refund policy}}` in `src/content/legal/terms.ts`.
   - (Done in M5: the landing FAQ placeholders were removed. The Appflow "3 months free" offer was removed as unconfirmed. Add it back in `src/app/(marketing)/page.tsx` if you want to make that offer.)
   - Have a lawyer review the legal pages before public launch.

10. **R2 bucket for bundles (needed before the M2 deploy)**
    - Create bucket `hotrail-bundles`: https://dash.cloudflare.com/?to=/:account/r2/new
    - Create an R2 API token (Object Read & Write, that bucket only): https://dash.cloudflare.com/?to=/:account/r2/api-tokens. Put `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in the Vercel project env.
    - Connect custom domain `hotrail-cdn.buffersoltech.com` to the bucket (bucket Settings, Custom Domains) and set `R2_PUBLIC_BASE=https://hotrail-cdn.buffersoltech.com`. Without it, downloads go through `/api/v1/files`.
    - Generate `SECRETS_KEK` (`openssl rand -base64 32`), store it in Vercel env and keep a copy in the owner's password manager: losing it makes managed signing keys unreadable.
    - Run `npm run db:indexes` once with `MONGODB_URI` set (new unique indexes for apps, bundles, channels).

11. **M3 deploy extras**
    - Run `npm run db:indexes` again (new indexes: events by device, devices by custom id, usage buckets TTL, native builds).
    - Cloudflare Worker cron: `cd infra/cron-worker && npx wrangler secret put CRON_SECRET && npx wrangler deploy` (https://dash.cloudflare.com/?to=/:account/workers). `JOBS` now defaults to `autopause-sweep,webhook-retries`.
    - npm token to publish `@buffersol/hotrail`, `@buffersol/hotrail-core`, `@buffersol/hotrail-updater`, `@buffersol/hotrail-mcp`: https://www.npmjs.com/settings/~/tokens (add as repo secret `NPM_TOKEN`).
    - Run `.github/workflows/plugin-ci.yml` once on GitHub (macOS runner) and fix whatever the first native build reports; no native code has been compiled yet.

12. **M4 deploy extras** (nothing was deployed in M4)
    - Run `npm run db:indexes` again: new collections `active_devices` (TTL on `expiresAt`) and `org_flags`.
    - Cloudflare Worker: redeploy so the new default `JOBS` (`autopause-sweep,limits-sweep,webhook-retries`) takes effect: `cd infra/cron-worker && npx wrangler deploy`. The per-minute `limits-sweep` is what picks up month rollovers and plan expiry; Vercel Cron also runs it once a day (`vercel.json`).
    - Stripe webhook endpoint must keep sending `customer.subscription.*`, `invoice.*`, `checkout.session.completed`, `charge.refunded`: a plan change republishes the org's pointers from that webhook (limit state reaches devices within the pointer cache, 5 s).
    - Set `R2_PUBLIC_BASE` (item 10) before relying on delta: `files_url` and `manifest_url` point at the CDN host only when it is set; otherwise they point at `/api/v1/files/...` on Vercel, which works but costs bandwidth. Make sure the custom domain exposes the `blobs/` prefix as well as `zips/` and `manifests/` (the bucket is read through one public host, so no extra rule is needed unless you restrict prefixes).
    - Email: usage and channel emails use `MAIL_PROVIDER`/`RESEND_API_KEY` like the rest. Without a provider they go to the console transport (nothing is sent).
    - Workflow change not made (not allowed in M4): `ci-templates/plugin-ci.yml` still has to be copied to `.github/workflows/plugin-ci.yml` and run once on GitHub. The "native written but not compiled" claim stays in the docs until that run is green.
    - Overage billing: usage above the plan is reported at $0.0015 per MAU but nothing is charged. To charge it, create a metered Stripe price with lookup key `hotrail_overage_mau` and report usage at period end (not built).

13. **M5 review items for the owner** (see docs/REVIEW.md)
    - Every Vercel environment needs `BETTER_AUTH_SECRET` (`openssl rand -base64 32`): https://vercel.com/ahmad-code/hotrail/settings/environment-variables . Production now refuses to sign upload URLs without it.
    - Set `DB_DRIVER` explicitly on every Vercel environment. Use `memory` only for a throwaway demo, `mongo` with `MONGODB_URI`. With Mongo, the R2 variables (item 10) are now **required**: production refuses to start the bundle store without them.
    - Point uptime probes at `/api/health`. It now returns 503 when the database is unreachable.
    - App id release requests: if a former customer (deleted account) or a rightful owner asks for an app id back, delete `ptr/<appId>/index.json` in the `hotrail-bundles` bucket after checking ownership: https://dash.cloudflare.com/?to=/:account/r2/default/buckets/hotrail-bundles
    - Copy decisions you may want to revisit: SSO is labelled "coming in v1" on the Team plan; the Appflow offer was removed; the hero line "same core features as Capgo" is still there and is a P1 in REVIEW (P1-22).
