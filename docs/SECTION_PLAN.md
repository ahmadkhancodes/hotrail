# Landing page section plan: hotrail.buffersoltech.com `/`

Layout type: **A (classic hero plus sections)** with a B-style argument in the middle. Reason: the product is understandable from one hero panel; the buyer is skeptical about safety, so the mid page spends time on rollback, signing and policy. Comparison pages (type D) are separate routes (see end).
Primary action: **Start free** (sign up, no card) with the CLI line beside it. One CTA above the fold; "Read the docs" is a text link. Conversion = account created.
Rules: every number below comes from `docs/brief.md`; targets are labelled as targets. No testimonials, logos or customer counts exist yet, so those slots are omitted, not faked. `{{...}}` marks facts to fill later. Copy follows the no hyphen / sentence case / no exclamation rules.

## 1. Nav (flat bar, sticky)
Hotrail by BufferSol · Docs · Pricing · Compare ▾ (Capgo, Capawesome, OtaKit, Appflow) · Sign in · **Start free**. Mobile: full height panel, staggered links.

## 2. Hero
- Headline: **Fix your Capacitor app today.** / **Not after review.**
- Subhead: Live updates with rollouts, auto pause and one click rollback. Same core features as Capgo, about half the price. Built for US, Canadian and UK mobile teams by BufferSol Technologies.
- CTA: **Start free** · beside it a mono command chip `npx @buffersol/hotrail init` (copy button) · text link "Read the docs".
- Risk reversal under CTA: Free plan, 500 MAU, no card.
- Proof signal adjacent: "Appflow access ends 31 Dec 2027. Already on @capgo/capacitor-updater? Change three URLs." (verified facts from the brief).
- Visual: **live signal box panel** (the signature move): three tracks (production, beta, staging); train 2K47 moves from the siding onto production while the signal steps red, amber, green at 25%; station counter reads "12,408 devices on 2K46, 4,102 on 2K47" (sample data, flagged as demo in the caption: "Demo data"). On 375 px it crops to one track plus the signal.

## 3. The incident strip (problem, in the buyer's words)
Heading: **A broken bundle should not cost you three days.**
Body: You shipped a JS or CSS change. It crashes on launch for some users. The fix is one line and the store review queue is 1 to 3 days. Meanwhile the one star reviews arrive. Three small beats, set as a timetable table (Time / What happened), not cards:
1. 09:12 Bundle 2K47 goes out to everyone.
2. 09:40 Crash reports climb. Fix is ready at 09:55.
3. Next week Store review finishes. With Hotrail: 10:05, the fix is on devices.
(Illustrative timeline, labelled "Illustration".)

## 4. Tagline reveal (mandatory B11)
"Ship the web layer straight to installed apps. Roll it out slowly. Pause it automatically. Reverse it in one click."
Word by word activation on scroll; full ink under reduced motion.

## 5. Benefits (asymmetric, not three equal cards): left sticky index, right stacked rows with a real UI fragment each
1. **Rollouts that stop themselves.** Any percentage from 1 to 100, sticky per device. If failures pass your threshold after the minimum sample, the rollout pauses. Target: synthetic failures pause within 2 buckets. (Fragment: signal at 25% turning red with "4.1% failures".)
2. **Reverse in one click.** The channel points at the previous bundle and the manifest switches in under 10 seconds (target). A bundle that crashes on boot reverts itself on the next launch. (Fragment: Reverse to previous button + siding diagram.)
3. **Native safe by default.** Every bundle carries a native fingerprint. A device on a native build that lacks a plugin gets "no update", not a crash. "12,408 devices run native build 1.8.0, which lacks @capacitor/camera 8.2. They'll stay on 2K46 until you ship a store build."
4. **Signed, always.** Ed25519 signed manifest per bundle, signing on by default, tampered manifest rejected by the plugin. No third party in your update path.
5. **Deltas, not downloads.** Content addressed files: a second upload of the same build sends under 1% of the bytes (target).

## 6. How it works (3 steps, each with a terminal fragment; mono)
1. **Init.** `npx @buffersol/hotrail init` finds your appId, adds `@buffersol/hotrail-updater`, offers migration mode if you use `@capgo/capacitor-updater`.
2. **Upload.** `npx @buffersol/hotrail upload` hashes files, sends only the new ones, signs the manifest, rejects native files.
3. **Release.** `npx @buffersol/hotrail release --channel production --percent 10`. Watch the train reach devices; the Applied event is your first update.

## 7. Compliance band (objection: "Is this allowed?")
Heading: **Web layer only.** Body: "Native changes still go through the stores. We block native files at upload." Links to the compliance guide (Apple 2.5.2 and the Developer Program License Agreement carve out, Google Play policy on JavaScript in a webview). Never says "Apple approved".

## 8. Migration and Appflow (split section)
Left: **Already on @capgo/capacitor-updater? Change three URLs.** updateUrl, statsUrl, channelUrl; swap the plugin at your next store build. Right: **Coming from Ionic Appflow?** Access ends 31 Dec 2027. Import guide and 3 months free on annual plans for Appflow refugees (offer from the brief, confirm before publishing: `{{confirm offer}}`).

## 9. Price (3 plans + Scale, from the brief) with MAU calculator
Headline: **Half the fare. Same line.** Table: Free $0 (500 MAU) · Solo $6.99 (2,000 MAU) · Maker $19.99 (10,000 MAU, auto pause, webhooks) · Team $49.99 (100,000 MAU, SSO) · Scale from $124.99 (sales assisted). Beside each: the Capgo list price with "checked 3 Nov 2026" and link ($14, $39, $99, $249). Annual toggle shows the saving as a number ($71.88, $203.88, $503.88 a year). Reassurance: "No bandwidth meter. No seats. Hit your limit and your app keeps running; we pause new downloads and ask." Note: Maker is highlighted by border plus label. Native build minutes are shown as "coming in v1", not as shipped.

## 10. Trust (security in plain facts)
Short list, only things that are built or committed: signing on by default; audit log on every plan; org roles with scoped API keys; MIT plugin you can read; export of bundles, manifests and events; no third party in the delivery path. SOC 2 stated honestly: "Not yet. See the security page, the DPA, and our pen test plan." Links to security.txt.

## 11. Built for agents and CI
`npx @buffersol/hotrail release` in GitHub Actions or GitLab CI snippets; MCP server (upload, release, rollback, stats; agent release needs explicit confirmation; no LLM on our side); llms.txt and "Copy for agent" on docs.

## 12. FAQ (schema.org FAQPage)
1. Is over the air allowed by Apple and Google?
2. Can I self host the plugin for free? (Plugin is MIT today. Free plan plus export; self host edge worker is on the roadmap.)
3. Will you be around in two years? (Link to BufferSol Technologies company page; `{{company page URL}}`.)
4. Do you have SOC 2? (Not yet; what we offer instead.)
5. What happens when I hit my limit? (App keeps working.)
6. Who owns the account if my agency leaves? (Org transfer and export; transfer is a v1 feature, state that.)
7. Why half the price? (Own edge code, R2 with no egress fees, deltas.)
8. What does it not do? (React Native, Flutter, native code changes, store publishing for now.)
9. Which Capacitor versions? (Capacitor 5 and up; `{{confirm min version}}`.)
10. What do you collect from devices? (Random device ID, app version, OS, platform; no IP stored.)

## 13. Final CTA
Heading: **Your next hotfix should take minutes.** CTA **Start free** + the command chip + "Free plan, no card."

## 14. Footer
Hotrail by BufferSol · Product (Docs, Pricing, Changelog, Status) · Compare · Legal (Privacy, Terms, DPA, Security, Sub-processors) · "A BufferSol product" · BufferSol Technologies.

## Other routes in the marketing set
`/pricing` (calculator, dated vs Capgo column), `/compare/capgo`, `/compare/capawesome`, `/compare/otakit`, `/compare/appflow`, `/appflow-alternative`, `/capacitor-live-updates`, `/compliance` (OTA rules guide), `/docs/*` + `/llms.txt`, `/security`, `/status`, `/privacy`, `/terms`, `/dpa`, 404. Comparison pages: factual, dated "last checked", sourced links, never Capgo's logo, colors or copy.

## SEO / AEO
Index all evergreen pages. Title: "Hotrail by BufferSol: live updates for Capacitor apps". Meta: "Push web layer fixes to installed Capacitor apps with rollouts, auto pause and one click rollback. About half the price of Capgo." FAQPage schema on `/`, SoftwareApplication schema with offers on `/pricing`. Target queries: Capgo alternative, Ionic Appflow alternative, CodePush alternative for Capacitor, Capacitor live updates.
