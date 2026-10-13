# issue_gate

See `docs/plan/mobile-secret-manager-mvp.md` for the Mobile Secret Manager
MVP story backlog and `docs/adr/` for the architecture decisions.

- [`backend/`](backend/README.md) — sync service implementing MSM-10..MSM-13
  (account auth, vault KDF bootstrap, item sync with optimistic concurrency,
  change-feed/tombstones). TypeScript/Node.js per ADR-0006.
