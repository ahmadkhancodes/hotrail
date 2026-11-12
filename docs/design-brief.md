# Hotrail by BufferSol: design brief ("the working timetable")

Status: approved by the redesign task of 12 Nov 2026. It replaces the "signal box" system (navy panel on warm paper) in `docs/DESIGN.md` §5 to §9. The founder said that system read as typical AI-generated UI, and he was right: warm cream paper, a dark mock "terminal" panel in the hero, mono `01 / 02 / 03` step numbers, a condensed display face and an amber accent is the house style of AI-built landing pages in 2026. Evidence for this brief: `docs/design/audit-2026-11/*.png` (Playwright, 1440x900 and 375x812, captured 12 Nov 2026). The final screens are in `docs/qa/design/`.

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

**The gap:** no one in the category looks like a precise operational document, and no one shows the release control surface itself. Hotrail's name already gives us the vocabulary (lines, headcodes, departures). We keep the vocabulary and drop the illustration: the page reads as a **working timetable**, the printed document railway staff run a line from. Ruled columns, real times, real figures, a single yellow marker for "the train that is moving now".

## 2. ICP card
A frontend or full-stack developer, or the release lead at a 2 to 200 person team in the US, Canada or UK, who ships a Capacitor app to both stores and has just shipped a broken web bundle. They read the page at a desk with an editor open, or on a phone during an incident. They fear an update they cannot undo, a vendor that disappears or leaks, and a surprise invoice. They trust GitHub, Linear, PlanetScale, CI logs and anything that shows its numbers. The developer is the buyer; a security reviewer sometimes follows.

## 3. Positioning line
For Capacitor teams stuck waiting one to three days on store review to fix a broken web bundle, Hotrail by BufferSol is the live update service with staged rollouts, auto pause and one click rollback at about half the Capgo price, signed by default with no third party in the update path.

## 4. Visual system (clearly different from the old one)

| Axis | Old ("signal box") | New ("working timetable") | Competitors |
|---|---|---|---|
| Ground | warm cream #F6F5F0 | paper white #FFFFFF, cool grey wells #F3F4F5 | navy-black, white |
| Accent | navy actions + amber focus | ink black actions + **signal yellow #FFD23F** as a marker fill only (live row, current page, headcode plate, selection) | azure, indigo, black pill |
| Hero | dark SVG panel with trains | the real release board, light, in a ruled frame, full container width | map, icons, logos |
| Type | Barlow Condensed / Atkinson / Red Hat Mono | **Archivo** expanded (wdth 112 to 125) display, **IBM Plex Sans** text, **IBM Plex Mono** figures | Inter-like sans |
| Shape | 2 to 4 px everywhere | 0 px for containers, tables and panels; 2 px for buttons and inputs only; round only for lamps | 8 to 16 px + pills |
| Rules | hairlines | thick/thin rules like a printed timetable: 2 px ink rule opens a section, 1 px hairlines divide rows | soft shadows |

### Palette (raw, then roles; light only)
- Ink ramp: `#0E1012` (ink), `#2B3036`, `#4A5058` (subtle, 8.0:1 on white), `#5E656E` (muted, 5.8:1), `#8B929B` (input borders, 3.2:1), `#C9CDD2` (strong rule), `#E3E5E8` (hairline), `#F3F4F5` (well), `#FFFFFF` (paper).
- Action: ink `#0E1012` with white text (19:1); hover `#2B3036`.
- Marker: signal yellow `#FFD23F`, always with ink text (14:1). Never used for text on white.
- Focus: `#1859D6` 2 px ring, offset 2 (5.6:1 on white, distinct from the marker).
- State only, always with glyph and word: go `#137A43` (●), caution `#8A5A00` text with `#E9A400` glyph (▲), stop `#C22E1F` (■).

### Type
Archivo is a grotesque from Omnibus-Type with a width axis; set expanded (`font-stretch: 112%` for headings, 125% for the hero) it reads like platform signage without the condensed "poster" cliché, and no rival uses a wide face. IBM Plex Sans carries an engineering lineage and stays legible at 14 px in dense tables. Plex Mono sets headcodes, times, percentages and commands with tabular figures. All SIL OFL, loaded with `next/font/google` (self hosted at build, no runtime CDN). Weights: Archivo 600/700, Plex Sans 400/500/600, Plex Mono 400/500. No italics, no 900.

### Grid, rhythm, radius
- 12 column grid, 1200 px container, 24 px gutters. Marketing sections alternate between three layouts on purpose: a **ledger** (label column 3 / content 9, ruled rows), a **split** (5 / 7) and a **full bleed board** (the product). No two adjacent sections share a layout, and padding varies (96, 64, 48) by weight of content.
- Section heads sit in the left label column, not centered. No eyebrow labels, no step numbers.
- Radius: `rounded-none` default; `rounded-sm` (2 px) on buttons, inputs, plates; `rounded-full` for lamps only.

### Imagery
Only the real product: the release board (channels, headcode, rollout percentage, devices, failure rate, lamp) rendered with the same `Plate` and lamp tokens as the console, and labelled "Example data". No illustrations, no icons in squares, no emoji.

### Motion
One signature beat: on first paint the live row's rollout bar fills from the previous percentage to the current one (transform: scaleX, 700 ms, `cubic-bezier(0.22, 1, 0.36, 1)`), once. Hover changes colour only (300 ms). `prefers-reduced-motion`: the bar is drawn at its final width with no transition. The tagline reveal keeps its per word opacity step.

## 5. App UI rules (every signed-in screen)
- Shell: a 240 px left rail on white with a hairline right edge, product wordmark, org switcher, nav items 44 px tall; the current page gets a 4 px yellow marker block and ink text, not a grey pill. Mobile: top bar + full screen menu.
- Page header: Archivo title, one line of plain description, one primary action on the right.
- Tables: 44 px rows, 1 px hairlines, sticky header in the well colour, mono tabular figures right aligned, no zebra.
- Forms: labels above inputs, 2 px radius, 44 px inputs, inline specific errors.
- Empty states: ruled box with a sentence, the exact command or action, and an example row so the user sees what will appear.
- Loading: skeleton blocks shaped like the rows. Errors: inline, specific, with a retry.
- Dialogs: square, 2 px ink top rule, one primary action.

## 6. Banned (checked on every page)
Centered hero over a gradient, glow or map; purple, indigo or blue as the accent; Inter, Geist or system fonts everywhere; three identical icon cards; "Everything you need" grids; emoji or stock art; glassmorphism; one big radius on everything; pill badges; uniform section rhythm; stat strips with invented numbers; "streamline", "seamless", "supercharge"; cream paper; mono step numbers as decoration; a dark terminal mock in the hero.

## 7. Copy
Unchanged in substance (it was already honest and dated). Headlines stay concrete ("Fix your Capacitor app today. Not after review."). Example data is always labelled. No invented logos, stats or testimonials.
