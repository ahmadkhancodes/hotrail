# Roadmap: Hotrail by BufferSol (full workbook MVP in 5 milestones)

Each milestone ends with: lint + typecheck + tests + build green, deployed, Playwright screenshots (375/1440, light) in `docs/qa/`, PROGRESS.md updated, PR merged to main, one line to the orchestrator.

| Milestone | Scope | P0s (brief numbering) |
|---|---|---|
| **M1 Foundation and storefront** | Copy kit-v1, apply DESIGN tokens, landing (SECTION_PLAN), pricing + MAU calculator, auth (GitHub/Google/magic link), orgs + roles + API keys, Stripe products/prices + checkout/portal/webhook, legal pages, `/api/health`, Vercel deploy + keep 3 | P0-1, P0-8 (core), legal |
| **M2 Ship path** | `packages/core` (manifest, Ed25519, delta, bucketing, fingerprint), R2 BlobStore + PointerStore, upload plan/finalize + native/zip bomb scan, CLI `init/upload/release/rollback`, bundles UI, update API hot path + Capgo protocol compat, channels + overrides | P0-2, P0-3, P0-5 (channels), P0-12 (CLI) |
| **M3 Control room** | Rollouts, auto pause evaluator + Cloudflare cron worker, one click rollback, compatibility check, Line (signal box) view, release dialog, event ingest, adoption charts, device lookup, webhooks | P0-5, P0-6, P0-7 |
| **M4 Plugin, agents, trust** | MIT Capacitor plugin (TS/Swift/Kotlin) + GitHub Actions e2e, MCP server (stdio + HTTP), billing limits + MAU emails + grace, Mailer templates + suppression, audit log, export, abuse rules, status page, backups + restore drill | P0-4, P0-8, P0-9, P0-10, P0-11 |
| **M5 QA and launch** | Docs + llms.txt + compare pages + compliance guide + security.txt, CI recipes, Playwright screenshots, Lighthouse 90+, design scorecard (DESIGN_PLAYBOOK §9), banned dependency check, launch checklist | P0-12 + polish |

Order inside M2 to M4 follows the brief's priority order. Post MVP, VPS dependent (not in this roadmap's scope): Postfix + MTA-STS + TLS-RPT + seed tests, GlitchTip, Prometheus/Grafana, Uptime Kuma, Mac/Linux build farm (v1), SAML.
v1 and v2 items stay out per the workbook.
