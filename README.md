# issue_gate

See `docs/plan/mobile-secret-manager-mvp.md` for the Mobile Secret Manager
MVP story backlog and `docs/adr/` for the architecture decisions.

- [`backend/`](backend/README.md) — sync service implementing MSM-10..MSM-13
  (account auth, vault KDF bootstrap, item sync with optimistic concurrency,
  change-feed/tombstones). TypeScript/Node.js per ADR-0006.
- [`web/`](web/README.md) — Next.js/TypeScript web client implementing the
  MVP UI flows (onboarding, unlock, secret CRUD, Recovery Kit, conflict
  resolution) against the backend's sync API, per ADR-0005.
- [`docs/ops/docker-and-vps.md`](docs/ops/docker-and-vps.md) — run the
  backend locally with Docker Compose first, with an optional, documented
  path to a single VPS host later (MSM-17-adjacent infrastructure).

Mobile (Flutter, per ADR-0005) is a separate codebase/toolchain and is not
part of this repository yet; see `web/README.md` for why web-first scope was
chosen for this change.
