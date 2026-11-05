# Progress: Hotrail by BufferSol

## State (5 Nov 2026)
- Phase 0 done and merged (PR #1). Palette revised to signal navy + amber after orchestrator review (PR #2). Design APPROVED.
- Pre-kit work, pure TS, no app code:
  - `packages/core` (`@buffersol/hotrail-core`): canonical JSON, SHA-256, semver, sticky bucketing, headcodes, manifest, Ed25519 signing (WebCrypto), delta planning, native file and zip-bomb policy, native fingerprint, `decideUpdate` (hot path decision). 21 tests.
  - `packages/cli` (`@buffersol/hotrail`): init, upload, release, rollback, status against the `/api/v1/*` contract in ARCHITECTURE.md, with a fake-server test suite. 12 tests.
  - Both: `pnpm install && pnpm -r typecheck && pnpm -r test` is green.
- Infra notes from the orchestrator: Vercel via `VERCEL_TOKEN_NEW_ACCOUNT` CLI/REST only (team ahmad-code); `DB_DRIVER=memory` until `MONGODB_URI` arrives.
- Waiting for: "kit-v1 ready". Next: copy kit, apply tokens, M1.
