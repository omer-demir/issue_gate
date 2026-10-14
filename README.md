# issue_gate

See `docs/plan/mobile-secret-manager-mvp.md` for the Mobile Secret Manager
MVP story backlog and `docs/adr/` for the architecture decisions.

- [`backend/`](backend/README.md) — sync service implementing MSM-10..MSM-13
  (account auth, vault KDF bootstrap, item sync with optimistic concurrency,
  change-feed/tombstones). TypeScript/Node.js per ADR-0006.
- [`web/`](web/README.md) — Next.js/TypeScript web client implementing the
  MVP UI flows (onboarding, unlock, secret CRUD, Recovery Kit, conflict
  resolution) against the backend's sync API, per ADR-0005.
- [`mobile/`](mobile/README.md) — Flutter (Dart) mobile client implementing
  the MVP UI flows (onboarding, unlock with optional biometric convenience,
  secret CRUD, Recovery Kit, offline queue, conflict resolution, deep links)
  against the same backend sync API, per ADR-0005. No source is shared with
  `web/`; see its README for the crypto/wire-contract parity notes and
  outstanding device-validation requirements.
- [`docs/ops/docker-and-vps.md`](docs/ops/docker-and-vps.md) — run the
  backend locally with Docker Compose first, with an optional, documented
  path to a single VPS host later (MSM-17-adjacent infrastructure).
