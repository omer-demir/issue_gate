# Running the backend: local Docker first, VPS later

This describes the infrastructure for MSM-17 ("Backend hosting"), scoped down
to the team's current need: **run locally first**, with a declarative,
reviewable path to a single VPS host later. It replaces neither a real
staging/production split nor MSM-17's approval-gated production deploy — see
"What's deliberately not done" below.

## Local (default, run this first)

```sh
docker compose up --build
```

- Builds `backend/Dockerfile` and starts the backend on `http://localhost:3000`
  (`GET /healthz` for a liveness check).
- Uses the backend's existing dev defaults (`backend/src/config.ts`); no
  `.env` file is required. Copy `.env.example` to `.env` only to override
  defaults (e.g. a different `BACKEND_PORT`).
- Storage is the in-memory `DocumentStore` (see `backend/README.md` — "Known
  MVP limitations"): data does **not** survive a container restart. This
  setup does not add a database container because the application does not
  yet have a concrete persistent `DocumentStore` implementation wired in;
  adding one is application code, out of this infrastructure change's scope.
- The container runs as a non-root user, with a read-only root filesystem,
  all Linux capabilities dropped, and `no-new-privileges`.

Stop with `docker compose down`.

## VPS (optional, later)

`docker-compose.prod.yml` is a standalone Compose file (not merged with the
local one) that additionally runs a Caddy reverse proxy for TLS termination
and stops publishing the backend port directly to the host:

```sh
cp .env.example backend.env   # fill in real values; never commit backend.env
docker compose -f docker-compose.prod.yml --env-file backend.env up -d --build
```

- Set `DOMAIN` in `backend.env` to a real domain pointed at the host so Caddy
  (`deploy/Caddyfile`) obtains a Let's Encrypt certificate automatically.
  Left unset it serves plain HTTP on `localhost` only, useful for a first
  smoke test before DNS is in place.
- Set `JWT_SECRET` to a strong, generated value (e.g. `openssl rand -hex 32`)
  stored only in `backend.env` on the host or your secrets mechanism — the
  backend refuses to start with the dev default once `NODE_ENV=production`
  (enforced in `backend/src/config.ts`).
- Both services run non-root, with dropped capabilities, `no-new-privileges`,
  and CPU/memory limits.
- Rollback: re-run the same command after checking out the previous commit's
  `backend/` tree (or re-tagging a previously built image), since the image
  is rebuilt from source rather than pulled from a registry in this setup.

This repository's tooling never runs this command; it is documented here for
a human operator to run manually on the VPS.

## What's deliberately not done here

- No cloud resources, DNS records, or VPS were created or modified — this is
  configuration only.
- No CI pipeline (MSM-16) or automated deploy-on-merge is added; `docker
  compose ... up -d` above is manual.
- No separate staging environment or deploy-approval gate (MSM-17 AC3) is
  implemented; today's scope is "local, with a VPS option," not a full
  staging/production split. Revisit MSM-17 in full once a VPS/cloud target is
  chosen.
- No persistent database container: the backend's `DocumentStore` port has
  no concrete non-in-memory implementation yet (application-code scope).

## Validation performed

- `docker compose config` / `docker compose -f docker-compose.prod.yml
  --env-file .env.example config` require the Docker CLI, which is not
  available in this governed tool environment — not performed here. Review
  the Compose YAML directly, and run `docker compose config` locally before
  first use.
- `npm ci --prefix backend` previously failed with a real `ERESOLVE` peer
  dependency conflict: `vitest@5.0.4` requires `@types/node@^22.0.0 ||
  >=24.0.0`, but `backend/package.json` pinned `@types/node@^20.14.9`. This
  would also have broken `backend/Dockerfile`'s builder stage (`npm ci`), so
  it was fixed here as a minimal, tightly-coupled devDependency bump to
  `@types/node@^22.0.0` (type-checking only, no runtime/behavior change), and
  `backend/package-lock.json` was regenerated with `npm install`.
- After the fix: `npm ci --prefix backend`, `npm test --prefix backend` (33/33
  passing), `npm run typecheck --prefix backend`, and `npm run build --prefix
  backend` all succeed, confirming the Docker build's `npm ci` + `npm run
  build` steps are unblocked. The actual `docker build`/`docker compose
  up --build` run itself is still not performed here (no Docker CLI in this
  environment) and should be the first thing a human verifies locally.
