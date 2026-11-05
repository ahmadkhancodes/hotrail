# Hotrail by BufferSol: visual system ("the signal box")

Status: Phase 0 proposal, awaiting orchestrator approval. Proof: `docs/design/mock.html` (+ `mock-1440.png`, `mock-375.png`). Research screenshots: `docs/design/refs/`.

## 1. ICP card (drives everything below)
A frontend or full-stack dev, or the release lead at a 2-200 person team (US/CA/UK), who ships a Capacitor app to both stores and just shipped a broken web bundle. They read the page at a desk with an editor open, or on a phone while an incident is live. They fear three things: pushing something that cannot be undone, a vendor that disappears or leaks, and a surprise invoice. They already trust: GitHub, Vercel, Linear, Railway, terminal output, timetable-grade clarity. Buyer is the developer; a security reviewer sometimes follows.

## 2. Positioning line
For Capacitor teams who are stuck waiting 1 to 3 days on store review to fix a broken web bundle, Hotrail by BufferSol is the live update service with rollouts, auto-pause and one-click rollback at about half the Capgo price, with signing on by default and no third party in the update path, unlike Capgo's metered credits and Capawesome's fixed rollout steps.

## 3. Competitor audit (live sites, 5 Nov 2026; screenshots in docs/design/refs/)
| Site | Hero claim | Hero visual | Palette / type | Density, proof | CTA |
|---|---|---|---|---|---|
| Capgo | "Ship Capacitor apps without the wait" | Dotted world map with pulsing nodes, no product UI | Navy-black, azure + white, Inter-style sans, italic logo | Low density; logo carousel with install counts, "9,400+ teams" | "Get started for free", 14-day trial |
| Capawesome Cloud | "The CI/CD platform built for mobile apps" | None (centered text) | White, indigo/violet, Manrope-like, rounded buttons, pill badge, heart emoji | Low; customer logo wall, "1,803 users joined last month" | "Get started" / "Book a demo" |
| OtaKit | "Ship app updates instantly" | Floating pastel app-icon tiles on a dot grid | White, black pill buttons, Inter, "NEW" pill | Low; no proof yet | "Start releasing free" |
| Expo (price anchor) | OTA for React Native | Pricing tables | Black/white, big type, whitespace | Medium | Plans |
| Railway (adjacent, loved) | "Ship software peacefully" | Real product canvas in a night-sky scene | Dusk purple, serif display + sans | Medium, real UI | Deploy |
| Linear (adjacent, loved) | Product development system | Real product UI | Near-black, restrained, one accent | High, precise | Sign up |

**Category cliches (avoid):** centered headline over a dark field with a blue/indigo accent; abstract hero art (map, floating tiles, gradients) with no product in it; pill badge above the H1; logo walls; Inter. **Nobody shows the actual release control surface in the hero**, and nobody has a visual identity of its own. **The gap we own:** a distinctive physical metaphor (railway signal box) that is also the real UI, in a navy and amber enamel palette none of the three use.

## 4. Direction
- **Concept:** a railway signal box mimic panel. Channels are tracks, bundles are trains carrying a 4 character headcode (2K47) on an enamel plate, devices are stations, rollout percentage is a signal, rollback is a train reversing into a siding. Mood: dependable, mechanical, legible, calm, exact.
- **Differs from the three closest competitors on four axes:** palette (signal navy and amber on warm paper vs azure/indigo/black), type (condensed railway display + hyperlegible body vs Inter/Manrope), layout (left-aligned, product-first, hero is the live panel vs centered text over art), imagery (schematic track drawings vs maps/tiles/logos).
- **Signature move:** the hero is the live mimic panel itself (animated SVG/CSS, static fallback): a bundle "train" travels the channel track as the rollout signal steps red, amber, green. The same component is the console's Line view, so marketing shows the real product.
- **Density:** high in the app (32 px rows, tables one click away), medium on marketing (left aligned, long measure, hairlines).
- **Voice:** a calm senior release engineer. Short sentences, real numbers, sparing dry railway humor, US English, no exclamation marks, sentence case.

## 5. Palette: "signal navy and amber" (revised 5 Nov after orchestrator review)
Change from the first draft: the railway green on warm paper was too close to DockCrate's dock green on warm paper, and all 50 BufferSol products are shown side by side. The primary family is now deep signal navy (blue black) with signal amber as the only highlight. The workbook's green stays only as the "go" lamp. Roles are unchanged, so this was a one file token swap.

Two layers: raw then role; components use roles only. Light (default) / Dark "night shift" (follows OS, `[data-theme=dark]` override):

| Role token | Light | Dark | Notes |
|---|---|---|---|
| `--bg` | #F6F5F0 | #0A101B | page |
| `--surface` | #FFFFFF | #121B2B | cards, panels |
| `--soft` | #ECEFF4 | #182338 | tinted wells, rails |
| `--ink` | #0F1B2D | #E7ECF4 | text (AA, about 16:1 / 15:1) |
| `--ink-muted` | #4A5668 | #9AA7BA | secondary (AA) |
| `--border` | #D5DAE2 | #243148 | hairline 1 px |
| `--track` | #1C2B44 | #5A6B87 | rails, 3 px |
| `--panel` | #0F1B2D | #0B1422 | the signal box board, dark in both themes |
| `--primary` | #14284B | #E7ECF4 | the one accent family: buttons, links (dark mode inverts to pale enamel) |
| `--primary-hover` | #0E1D38 | #FFFFFF | |
| `--on-primary` | #FFFFFF | #0A101B | white on #14284B is about 14:1 |
| `--focus` (signal amber) | #E0A21B | #F0B93A | 3 px focus ring, selected tab underline, prompt `$` |
| `--lamp-green` | #2E9E5B | #3DBB73 | state only |
| `--lamp-amber` | #E0A21B | #F0B93A | state only; dark ink on amber, never white text |
| `--lamp-red` | #C8372D | #E4574D | state only |
| `--plate` | #F4F1E6 | #F4F1E6 | headcode enamel plate |
| `--info` | #2C6E91 | #5FA8CF | |

Rules: navy is the action colour, amber marks focus and selection, lamps are state only and always pair colour + glyph + text (G ● / A ▲ / R ■). Flat backgrounds, no gradients, no hero text gradient. Differs from Capgo's bright azure on near black, Capawesome's indigo and DockCrate's green. Dark backgrounds use this palette (override of the skill's six-value list, logged in DECISIONS.md).

## 6. Type
- Display: **Barlow Condensed** 500/600 (railway signage lineage, tight, tall). Body/UI: **Atkinson Hyperlegible** 400/700 (designed for legibility; fits "legible under pressure"). Data, headcodes, CLI, tabular figures: **Red Hat Mono** 400/500.
- All three SIL OFL, loaded with `next/font/google` (downloaded at build, self-hosted, no runtime Google CDN, which the brief bans). Override of the skill's one-typeface rule, justified by the ICP's mono/data needs and the workbook's own spec; no italics, no weight over 700.
- Scale (snaps to Tailwind steps, named styles kept): display-xl 48/48 (`heading-2` step, hero), display-l 36/40, title 24/32 and 20/28, body 16/24 and 14/20, small 12/16, headcode 18/18 600 with 0.08em tracking. H1 hero on mobile steps down to 36/40. Hero heading and subheading max 680 px. `text-wrap: balance` on headings, `pretty` on body. No hyphens in copy.

## 7. Shape, spacing, grid
- Spacing tokens: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 only (theme restricted). Section padding 80 to 96 desktop, 48 to 64 mobile.
- Radius: 2 (sm), 4 (md), pill only for lamps. Sharp, engineered. Nested rule honored (inner = outer minus gap, only if above 2).
- Borders: 1 px hairline all the way around; 3 px for track rails. Never single sided card borders (row dividers are their own elements).
- Elevation: two levels. Flat surface; drawer/popover `0 8px 24px rgba(22,32,27,.16)`.
- Container 1200 px; breakpoints 480/768/1024/1440. Track view becomes a vertical list under 768. Tap targets 44 px on mobile.

## 8. Iconography, imagery, dataviz
- Icons: **Phosphor** (light/regular, 1.5 px visual stroke, 20 px), via `@phosphor-icons/react`. Custom SVG: signal post, points, buffer stop, headcode plate. No emoji, no icon-in-circle on cards, no Material.
- Imagery: no stock, no illustration of people. Schematic track drawings and real product UI only. OG images are generated headcode plates.
- Dataviz (per the dataviz skill): adoption = stepped line on a timetable grid; failures = red ticks on the track; no donuts, no rainbow; sequential single-hue green ramp; every colour doubled with glyph/label.

## 9. Motion
Base curve `cubic-bezier(0.22, 1, 0.36, 1)`. 120 ms lamp cross-fade (opacity is never under 200 ms for hover per the skill, so hover uses 200, lamp state changes 120 as a documented exception for state, not hover), 240 ms drawer, 500 ms train travel. Only transform and opacity animate. Scroll reveal: 32 px rise, 700 ms, once. Tagline reveal section (mandatory): word by word from 30% to full ink via per-word IntersectionObserver, full ink immediately under `prefers-reduced-motion`. Reduced motion = opacity only; the hero panel freezes on a composed frame. Optional bell tick on auto-pause, off by default.

## 10. Components (product and marketing share them)
Track, Train (headcode plate), Signal (arm angle = rollout %), Station counter, Inspector drawer, Command palette (`/`), virtualised DataTable (sticky head, `tabular-nums`), Meter (gauge, lamp at 90%), plus states: skeletons shaped like content, composed empty states ("No trains on this line yet. Run `npx @buffersol/hotrail upload`."), specific inline errors.

## 11. Do / Don't
Do: left align; show real UI with believable odd numbers (2K47, 38.6%, 12,408 devices); put the CLI command beside every CTA; date every comparison; use a visible focus ring in amber; keep status triple-coded.
Don't: purple/blue gradients, glow blobs, glassmorphism (the nav is a flat translucent bar at most), rockets/clouds, emoji, sparkle icons, identical rounded card grids, cream plus terracotta, Inter/Space Grotesk/Roboto, Capgo's azure/teal/slate palette, layout, logo or the phrase "Release Control Room", fake logos/testimonials/stats, "blazing fast", "supercharge", exclamation marks.

## 12. Why this fits the ICP better
Developers under incident pressure trust legibility and precision over decoration. Capgo and Capawesome look like generic dev-tool marketing and hide the product; OtaKit is clean but anonymous. Hotrail leads with the thing the buyer actually fears (a bad bundle on live devices) drawn as a signal box they can read in two seconds, in a navy and amber palette and a typeface that nobody in the category uses, so it is recognisable in a screenshot and credible as a calm, engineered tool. Accessibility (triple-coded status, hyperlegible body, AA contrast, keyboard release flow) is a visible trust signal for the security reviewer.
