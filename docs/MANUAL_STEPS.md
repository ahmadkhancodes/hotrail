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

9. **Legal and copy placeholders** (owner facts; flagged as `{{...}}` in the shipped pages until filled)
   - `{{jurisdiction}}` and `{{registered address}}`: `src/config/product.ts` (`legal`), used by terms, privacy, DPA.
   - `{{cap}}`: liability cap in `src/content/legal/terms.ts`.
   - `{{company page URL}}`, `{{confirm min version}}`, `{{confirm offer}}` (3 months free on annual for Appflow teams): landing FAQ and migration section in `src/app/(marketing)/page.tsx`.
   - Have a lawyer review the legal pages before public launch.
