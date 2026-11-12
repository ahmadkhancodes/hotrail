# Hotrail landing: identity and library compliance (2026-11-12)

| Item | Hotrail |
|---|---|
| Palette | white `#ffffff`, raised `#f7f9fc`, ink `#0a1633`, subtle `#3b4559`, muted `#525d72`, cobalt `#1546c9` (actions, rules, plates), cobalt hover `#0f379f`, marker `#dbe5fd`, lamps red `#c22e1f` / amber `#b57a00` / green `#13843f` |
| Fonts | Jost (display, numerals), Albert Sans (body), DM Mono (figures, commands) |
| Radius feel | square containers (0px), 2px controls, round lamps only |
| Layout type | A, classic hero plus sections: the product reads from one screenshot (the release board), and the ICP (Capacitor teams) needs to see rollouts, pause and reverse before reading |
| Hero composition | left aligned two line claim (680px), offset subtitle and one CTA with the copyable `init` command, then the full width departure board |
| Signature element | the departure board: a 128px cobalt rollout numeral, cobalt plates with white headcodes, signal lamps, 2px cobalt timetable rules opening every section |

How it differs from the other six: Hotrail is the only one on bright white with a single saturated cobalt (Postslot warm paper and stamp, Wirebook green ledger, DockCrate steel stencil, Stepclimb blueprint, Inboxwire white API docs, Straightpin newsprint), with square corners and giant timetable numerals instead of illustrations.

Measured (local `next start`, Chrome): h1 680px at 1440 (was 1024), font sizes 12/14/16/18/20/24/30/36/48/60/72/128 (was 64, 80 and 144 off scale), no horizontal overflow at 375/390 on `/`, `/pricing`, 404. Lighthouse 12 mobile: `/` 95 perf / 96 a11y, `/pricing` 97 / 100. Tagline words read 0.3 then switch to 1 one at a time in reading order; 1 immediately under reduced motion.

Screens: `landing-before-{375,1440}.png`, `landing-after-{375,1440}.png`, `landing-after-menu-390.png`.
