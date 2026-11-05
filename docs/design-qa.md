# Design QA scorecard (DESIGN_PLAYBOOK §9), M1-B storefront, 5 Nov 2026

Screenshots: `docs/qa/` (`/`, `/pricing`, `/compare/capgo`, `/docs/quickstart`, `/sign-in`; 375 and 1440; light and dark). Overflow check in `scripts/screenshots.ts`: no horizontal overflow on any of the 20 captures. Self-graded.

| Category | Score | Worst problem |
|---|---|---|
| 1. Message clarity | 4 | One primary CTA, number in hero (500 MAU); no pricing hint in the H1 itself |
| 2. ICP fit | 5 | none; navy, amber, Barlow Condensed, mimic panel differ from Capgo, Capawesome, OtaKit on palette, type, layout, imagery |
| 3. Hero and product proof | 4 | Panel is static SVG with sample data (labelled "Demo data"); the real Line view comes with the console |
| 4. Structure and rhythm | 4 | Several raised/base sections alternate with similar padding |
| 5. Typography | 4 | Named styles only; display font on headings; body links in mono chips are small (14px) |
| 6. Spacing and radius | 4 | Radii now 2/4 via theme; auth pages inherit kit layout |
| 7. Color and contrast | 4 | Lamp glyph text on the dark panel not contrast-measured with a tool |
| 8. Motion and states | 4 | Train and lamp animate with transform/opacity only; reduced motion freezes on the composed frame |
| 9. Content honesty | 5 | No stats, logos or testimonials; sample data labelled; targets labelled; competitor facts dated and sourced; placeholders flagged |
| 10. Responsive and ship | 4 | 375: hero CTA and command in first screen, panel crops to one track |

Total 42/50, no category below 3, no hard fail.

## Greps (all from `src`)
- `text-\[|p-\[|m-\[|gap-\[|rounded-\[`: no hits.
- `Inter|Roboto|Arial|Helvetica|Open Sans`: no hits.
- `bg-gradient|linear-gradient`: no hits (the kit's hero text gradient utility was removed).
- `ease-in-out|ease-linear|transition-all`: no hits.
- `supercharge|revolutionize|seamless|effortless|unlock|blazing`: one hit in a code comment (`api/billing/entitlement`), not product facing.
- `href="#"`: no hits.
- Hex literals outside the theme: `src/lib/mail/templates.ts` (inline email CSS, cannot use tokens; to restyle with the email work in M4), OG and icon images (ImageResponse needs literals), `layout.tsx` theme-color (set to the palette).
- `grep -rniE "postslot|web3forms|submission" src`: no hits.

## Residual
- Email templates still use the kit's grey palette.
- Capawesome, OtaKit and Appflow compare pages are not built (only Capgo was in scope).
