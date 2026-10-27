# Docker, local proxy, and VPS configuration

Commands run from the repository root. The [root README](../../README.md#run-locally) is the integrated local quick start; this guide covers container behavior, configuration changes, and hosting prerequisites. Use disposable data: **the API has no persistent store**.

## Local backend container

Requires Docker and Compose v2:

```sh
docker compose config --quiet
docker compose up --build
```

This starts only the backend on http://localhost:3000. Its liveness endpoint is `/healthz`, returning `{"status":"ok"}`. It does not start web, mobile, or a database.

For the root web/mobile quick start, publish host port 4000 instead:

```sh
BACKEND_PORT=4000 docker compose up --build
```

To keep overrides, copy `.env.example` to `.env` and edit it before running Compose. Local Compose interpolates the JWT, token TTL, page-size/retention, and host-port settings from that file. It explicitly sets the container's `PORT=3000` and `NODE_ENV=development`; changing the host port does not change the internal port.

```sh
docker compose ps
docker compose logs --tail=100 backend
docker compose down
```

Avoid sharing logs without reviewing them for sensitive data. Restarting or recreating the backend loses every account, session, and vault record. Adding a volume does not fix this because the application has no disk-backed adapter.

The multi-stage image runs the backend as a non-root user. The Compose service has a read-only root filesystem, `/tmp` tmpfs, dropped capabilities, `no-new-privileges`, and resource limits. These controls apply to the backend, not automatically to every other service.

**Node-version caveat:** `backend/Dockerfile` currently pins Node 20.17.0, while locked backend test dependencies require newer Node versions (Vitest requires 22.12+ on 22.x, 24.x, or 26+). The builder installs dev dependencies, so engine warnings or strict-engine installation failures are possible. The image does not run tests. Use the documented host Node toolchain for development/checks; align and verify the container toolchain before relying on it for releases.

## Local browser proxy

The API exposes `/v1` routes but no CORS policy, and Next.js has no API rewrite. [`deploy/Caddyfile.local`](../../deploy/Caddyfile.local) supplies a loopback-only HTTP entry point with these routes:

| Browser URL | Upstream | Path handling |
|---|---|---|
| `http://localhost:8080/v1/*` | `127.0.0.1:4000` | Preserve `/v1` |
| Other paths on `http://localhost:8080` | `127.0.0.1:3000` | Preserve path; Next.js handles pages/assets |

With the API and Next.js running, and `NEXT_PUBLIC_API_BASE_URL=/v1` in `web/.env.local`:

```sh
caddy validate --config deploy/Caddyfile.local --adapter caddyfile
caddy run --config deploy/Caddyfile.local --adapter caddyfile
```

Open http://localhost:8080. The HTTP-only loopback setup avoids certificate setup for local development; do not expose it as an Internet deployment. Stop Caddy with Ctrl+C. Change upstream ports in this file if changing the root quick-start ports, then restart the proxy. It is separate from the VPS `deploy/Caddyfile` and is not included in either Compose file.

## Configuration changes

[Backend configuration](../../backend/README.md#configuration) documents application defaults and caveats. Root `.env.example` serves two different uses: local `.env` for Compose interpolation, or `backend.env` for the standalone VPS file. Neither file is automatically loaded by the backend's npm scripts.

To apply local Compose environment changes, run `docker compose up -d` to recreate services as needed; a plain container restart does not replace its environment. Add `--build` when changing application source/image inputs. Remember that recreation resets data.

Never commit populated secret files. Generate a strong JWT secret outside source control (for example, with `openssl rand -hex 32`). Changing the signing secret invalidates previously signed access tokens; a process restart already clears this implementation's in-memory account/session state.

## VPS configuration: not production-ready

`docker-compose.prod.yml` is **standalone**, not an overlay to merge with `docker-compose.yml`. It describes a backend and Caddy proxy with named Caddy state volumes, but it is not a complete or verified production deployment. Do not use it for real vault data in its current state.

Before any deployment, resolve these concrete blockers:

| Blocker | Required work |
|---|---|
| No persistent backend | Implement/wire a durable adapter, concurrency tests, backups, and restore procedures |
| Proxy cannot reach backend on current networks | Backend joins only `internal`; proxy joins the implicit default network. Put them on a shared network and verify `backend:3000` reachability |
| No web service | Choose web hosting and same-origin `/v1` routing, or implement a reviewed API CORS policy for separate origins |
| Container toolchain mismatch | Align the Docker Node version with supported dependencies and verify builds/checks |
| Missing operational controls | Review rate limiting, logs/alerts, secrets rotation, TLS, firewall rules, staged rollout, and rollback |

The existing VPS Caddy service is not configured with the backend's explicit non-root user, read-only filesystem, or dropped-capability settings. Do not claim identical hardening for both services.

To prepare and inspect configuration without launching it:

```sh
cp .env.example backend.env
# Edit backend.env: replace JWT_SECRET and set DOMAIN to your intended hostname.
docker compose -f docker-compose.prod.yml --env-file backend.env config --quiet
```

`--env-file` supplies interpolation (notably `DOMAIN`); the service's `env_file` also injects `backend.env` into the backend. Keep `PORT` at 3000 for the existing proxy and health checks. The backend is forced to `NODE_ENV=production`, which rejects the known development signing secret, but does not validate secret strength.

For public HTTPS, point the chosen domain's DNS to the host and arrange inbound access to ports 80/443. Caddy needs its data volume to retain certificate state. The VPS Caddyfile's bare `localhost` default does **not** explicitly configure plain HTTP: Caddy may use local HTTPS certificates. Use a real domain for public hosting; use the separate local proxy for HTTP development.

Choose a reviewed immutable release/image and a rollback strategy before deployment. Rebuilding old source is not sufficient protection for data migrations; rollback must account for persistent data once an adapter exists. No command in this guide provisions cloud resources or supplies a deployment approval process.

## Troubleshooting

| Symptom | Check |
|---|---|
| Port 3000 already in use | Keep Next.js on 3000 and publish/run the API on 4000 |
| Browser `network_error` or CORS failure | Open the proxy URL; use `/v1` as the browser base and do not call the API cross-origin |
| API request returns 404 | Ensure client base includes `/v1`, without a trailing slash |
| Proxy returns 502 | Ensure API/Next.js are running at the configured upstream ports; for VPS, resolve the network mismatch first |
| Data or accounts disappear | Expected after API restart with the in-memory store |
| Environment edits have no effect | Restart direct processes, recreate Compose services, rebuild web bundles/mobile apps as appropriate |
| Web Crypto unavailable | Use localhost for local development or HTTPS for remote browser access |

Configuration parsing alone does not prove connectivity, durability, native integration, or production readiness. Verify the intended topology and account/vault flows with disposable data before relying on it.
