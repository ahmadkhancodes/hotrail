# Progress: Hotrail by BufferSol

## State (5 Nov 2026)
- Phase 0 done and merged (PR #1). Palette revised to signal navy + amber after orchestrator review (PR #2). Design APPROVED.
- Pre-kit work, pure TS, no app code:
  - `packages/core` (`@buffersol/hotrail-core`): canonical JSON, SHA-256, semver, sticky bucketing, headcodes, manifest, Ed25519 signing (WebCrypto), delta planning, native file and zip-bomb policy, native fingerprint, `decideUpdate` (hot path decision). 21 tests.
  - `packages/cli` (`@buffersol/hotrail`): init, upload, release, rollback, status against the `/api/v1/*` contract in ARCHITECTURE.md, with a fake-server test suite. 12 tests.
  - Both: `npm install && npm test` is green (moved from pnpm to npm workspaces in M1-A).
- Infra notes from the orchestrator: Vercel via `VERCEL_TOKEN_NEW_ACCOUNT` CLI/REST only (team ahmad-code); `DB_DRIVER=memory` until `MONGODB_URI` arrives.
- M1-A done (5 Nov 2026): kit adopted and renamed to Hotrail, plans/limits from brief (Free/Solo/Maker/Team, meter = MAU), design tokens and fonts applied, npm workspaces (core, cli). lint, typecheck, test (45 app + 12 cli + 21 core), build green. Marketing pages were the kit sample copy until M1-B.
- Next: M1-B, landing and pricing pages.

- 2026-11-05: M1-A finished: rename, npm workspaces, tokens, green checks.

- 2026-11-05: M1-B code done, deploy pending (not deployed on purpose). Storefront rebuilt: landing with the mimic panel hero, /pricing (Free/Solo/Maker/Team + Scale "talk to us", limits table, annual toggle with dollar savings, dated Capgo list prices), /compare/capgo (Web3Forms page removed), /docs/quickstart (migration guide, CLI, GitHub Actions and GitLab CI stubs marked coming), docs/llms.txt/nav/footer rewritten, legal pass (placeholders listed in MANUAL_STEPS item 9), theme radii 2/4, hero text gradient removed. QA screenshots in docs/qa/, scorecard in docs/design-qa.md (42/50). Next: M2, the update API and upload pipeline.
