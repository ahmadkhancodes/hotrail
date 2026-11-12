# Hotrail by BufferSol: design brief ("the departure board")

Status: approved by the identity task of 12 Nov 2026 (second pass that day). It replaces the "working timetable" system (ink black buttons and a signal yellow marker on white, Archivo + IBM Plex), which, next to six sibling BufferSol products, read as one shared house look: neutral grotesk, black buttons, warm or plain paper. Hotrail now has its own identity: **release engineering, cobalt blue on bright white, huge numerals (rollout percentages, prices, times) as the visual anchor, a departure board layout, a geometric grotesk.** The competitor audit, ICP and positioning below still hold. Final screens: `docs/qa/design/` (1440 and 375, light only).

Sibling directions we must not drift toward: terracotta and serif (Postslot), newsprint grey and highlighter (Straightpin), ink black with lime (Inboxwire), technical drawing blue grey with safety orange (Stepclimb), mint ledger and forest green (Wirebook), concrete grey with teal (DockCrate).

## 1. Competitor and taste audit (screenshots in docs/design/audit-2026-11/)

| Site | Role | What the first screen does |
|---|---|---|
| capgo.app | direct rival | Navy-black field with a dotted world map, centered two-line H1 with the second line in bright azure, one blue pill CTA, a strip of customer logos with install counts |
| capawesome.io/cloud | direct rival | White, centered H1, pill badge above it ("#1 Ionic Appflow Alternative"), indigo button, heart emoji proof line, logo strip |
| otakit.app | direct rival | White, centered H1, floating pastel app icons as decoration, black pill CTA, three check-mark claims |
| expo.dev/eas | price anchor | White, centered H1 under a logo, two big rounded cards with an icon in a blue square |
| sentry.io | adjacent, loved by the ICP | Deep purple, centered H1 with a coloured word, illustration mascot, product panels below |
| planetscale.com | adjacent, loved by the ICP | White, left aligned, all monospace, dense paragraphs, square hairline grid of customer names, one orange accent, square corners |
| fly.io | adjacent, loved by the ICP | Pastel illustrated world, serif H1 with an italic second line, coral pill CTA |

**What they all do:** a centered H1 over a field (dark, map, gradient or floating icons); one saturated blue, indigo or purple accent; an Inter-like grotesque; a pill badge or pill buttons; a logo strip as proof; the product is not visible above the fold (Sentry is the exception, and it is stylised).

**What the ICP rewards:** PlanetScale is the one the ICP quotes as "looks like engineers made it". It is left aligned, typographic, square, dense, and uses one warm accent sparingly. Our buyer reads changelogs, `git log` and CI output all day. Tables are their native format.

**The gap:** no one in the category looks like a precise operational document, and no one shows the release control surface itself. Hotrail's name already gives us the vocabulary (lines, headcodes, departures). We keep the vocabulary and drop the illustration: the page reads as a **departure board**: a cobalt band on top, ruled rows, and the one number that matters right now (how far the rollout has gone) set huge. Capgo also uses blue, but as azure on navy with a centred H1 and a map; ours is a deep cobalt on bright white with left aligned, number led layouts and no illustration.

## 2. ICP card
A frontend or full-stack developer, or the release lead at a 2 to 200 person team in the US, Canada or UK, who ships a Capacitor app to both stores and has just shipped a broken web bundle. They read the page at a desk with an editor open, or on a phone during an incident. They fear an update they cannot undo, a vendor that disappears or leaks, and a surprise invoice. They trust GitHub, Linear, PlanetScale, CI logs and anything that shows its numbers. The developer is the buyer; a security reviewer sometimes follows.

## 3. Positioning line
For Capacitor teams stuck waiting one to three days on store review to fix a broken web bundle, Hotrail by BufferSol is the live update service with staged rollouts, auto pause and one click rollback at about half the Capgo price, signed by default with no third party in the update path.

## 4. Visual system

| Axis | Old ("working timetable") | New ("departure board") |
|---|---|---|
| Ground | paper white, grey wells | bright white `#FFFFFF`, cool blue grey wells `#F1F4F9` / `#F7F9FC` |
| Accent | ink black buttons + signal yellow marker | **cobalt `#1546C9`** for actions, rules, plates, numerals; cobalt tint `#DBE5FD` behind the live row and current page |
| Anchor | the table | **huge numerals**: rollout % (144 px on desktop), prices, incident times, the 404 |
| Type | Archivo expanded / IBM Plex Sans / Plex Mono | **Jost** (geometric grotesk, display + numerals) / **Albert Sans** (geometric text grotesk) / **DM Mono** (commands, headcodes, logs) |
| Rules | 2 px ink rule opens a section | 2 px **cobalt** rule opens a section; 1 px hairlines `#E1E6EF` divide rows |
| Plates | yellow plate, ink text | cobalt plate, white mono headcode (like a platform indicator) |
| Mark | yellow square | two cobalt rails (`h-3 w-4 border-y-4`), also the favicon |

### Palette (light only) and contrast pairs
- Ink ramp: `#0A1633` ink (17.6:1 on white), `#1F2A44`, `#3B4559` subtle (9.6:1), `#525D72` muted (6.6:1 on white, 6.0:1 on `#F1F4F9`), `#7C879C` input borders (3.5:1, non text), `#C3CBD9` strong rule, `#E1E6EF` hairline, `#F1F4F9` well, `#F7F9FC` raised, `#FFFFFF` paper.
- Cobalt: `#1546C9` action and accent text (7.6:1 on white; white on it 7.6:1), hover `#0F379F` (10.2:1), deep `#0A2470` (inverse surface), tint `#DBE5FD` (ink on it 15:1), `#EEF3FE`.
- Focus: cobalt 2 px outline, offset 2 (7.6:1 on white; the offset keeps it visible on cobalt buttons).
- State, always glyph + word: go `#13843F` (●), caution `#8A5A00` text with `#B57A00` glyph (▲, 3.7:1), stop `#C22E1F` (■).
- Lighthouse (local, `next start`): `/` performance 95 (91 on the first cold run), accessibility 100; `/pricing` 98 / 100. Contrast and target size audits pass.

### Type
Jost is a Futura lineage geometric grotesk with lining figures that stay crisp at 144 px; it sets headings (500/600) and the `numeral-1/2/3` utilities (9 / 5 / 3 rem, tight tracking, lining tabular figures). Albert Sans is a geometric text grotesk that holds up at 14 px in dense tables. DM Mono sets commands, headcodes, logs and small figures. All SIL OFL via `next/font/google` (self hosted at build). Display uses `display: "optional"` and is preloaded; mono is not preloaded.

### Grid, rhythm, radius
- 12 column grid, `max-w-7xl` container. Sections alternate ledger (4/8), split (5/7) and the full width board; padding varies (96, 64, 48).
- Radius: `rounded-none` for containers, tables and panels; 2 px for buttons, inputs and plates; round only for lamps. No pills.

### Motifs
- **The board:** a cobalt caption band ("Departures · app · Example data"), a left "now departing" cell with the huge percentage, plate and previous headcode, a right timetable of channels with display numerals, and a mono log with times.
- **Numerals over adjectives:** prices are whole dollars set huge with raised cents; the incident table sets times in cobalt display figures.
- **The live row:** cobalt tint plus a 4 px cobalt edge (board, Line view tracks, app nav current page, featured plan top edge).

### Motion
One beat: the live rollout bar fills from its previous step once (700 ms, `cubic-bezier(0.22, 1, 0.36, 1)`); hover changes colour only; reduced motion draws it at its final width.

### What changed, what stayed
- Changed: every colour token (`src/app/globals.css`), the font pairing (`src/app/fonts.ts`), the hero board, pricing table, Line view (inspector shows the huge percentage), buttons (cobalt primary, cobalt outline secondary), app nav current page, the brand mark, OG image, icons, e-mail templates, 404.
- Stayed: copy and claims, the information architecture, the real product hero, square containers, state colours, the single motion beat. `tests/unit/design-system.test.ts` fails if the old yellow, black, cream, navy or indigo values or the old fonts come back.

## 5. App UI rules (every signed-in screen)
- Shell: 256 px left rail on white with a hairline edge, rails mark + wordmark, org switcher, 44 px nav items; the current page gets the cobalt tint, a 4 px cobalt edge and a cobalt icon. Mobile: top bar + full screen menu.
- Page header: Jost title, one line of description, one primary action, then a 2 px cobalt rule.
- Tables: 44 px rows, hairlines, well coloured header, mono tabular figures right aligned, no zebra; the selected row takes the cobalt tint.
- The rollout figure is the anchor of the inspector (`numeral-2`, cobalt).
- Forms: labels above, 44 px inputs, 2 px radius, inline specific errors. Dialogs: square, cobalt rule, one primary action.

## 6. Banned (checked on every page)
Centred hero over a gradient, glow or map; purple or indigo; Inter, Geist or system fonts everywhere; three identical icon cards; "Everything you need" grids; emoji or stock art; glassmorphism; one big radius on everything; pill badges; uniform section rhythm; invented stats; "streamline", "seamless", "supercharge"; cream paper; black primary buttons; dark mode; a dark terminal mock in the hero.

## 7. Copy
Unchanged in substance. Example data is always labelled. No invented logos, stats or testimonials.
