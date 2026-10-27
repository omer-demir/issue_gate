# issue_gate

A secret manager with a Next.js web client, Flutter mobile client, and TypeScript sync API. Clients encrypt vault contents before sending them to the API; account login is separate from vault unlock.

**Development-stage software:** the backend stores everything in memory and loses accounts, sessions, and vault data on restart. Use disposable test credentials, not real secrets. Native mobile runners and several production requirements are still missing; see [current limitations](docs/design/mobile-secret-manager-architecture.md#current-limitations).

## Tech stack

| Component | Stack | Guide |
|---|---|---|
| Backend | Node.js, TypeScript, Express, JWT, in-memory document store | [Backend README](backend/README.md) |
| Web | Next.js 15 App Router, React 19, TypeScript, Web Crypto | [Web README](web/README.md) |
| Mobile | Flutter/Dart, Provider, `cryptography`, secure storage, `local_auth` | [Mobile README](mobile/README.md) |
| Local/hosting configuration | Docker Compose for the API; Caddy reverse proxy | [Operations](docs/ops/docker-and-vps.md) |
| Checks | Vitest, Supertest, React Testing Library, ESLint, Flutter tests/analyzer | Commands below |

There is no root npm package or shared client-source package. Install and run each component separately. A persistent NoSQL adapter is planned but is not connected to the server.

## Run locally

### Prerequisites

Use Node.js **22.12+ on the 22.x line, or 24.x**, with npm (compatible with the locked backend test dependencies). For the integrated browser setup, install Caddy 2. Docker with Compose v2 is optional for running the API instead of Node. Mobile additionally requires a current stable Flutter SDK and platform tooling; see its guide.

The commands below run from the repository root in a POSIX shell. In PowerShell, set `$env:PORT="4000"` before running the backend command instead of using the inline `PORT=4000` form.

### Backend and web

Install dependencies and create the web configuration once:

```sh
npm ci --prefix backend
npm ci --prefix web
cp web/.env.example web/.env.local
```

Keep these three commands running in separate terminals, each from the repository root:

```sh
# Terminal 1: API on port 4000
PORT=4000 npm run dev --prefix backend
```

```sh
# Terminal 2: Next.js on port 3000
npm run dev --prefix web -- --port 3000
```

```sh
# Terminal 3: same-origin browser entry point
caddy run --config deploy/Caddyfile.local --adapter caddyfile
```

Open **http://localhost:8080**. The local proxy sends `/v1/*` to the API without stripping `/v1`, and all other paths to Next.js. `web/.env.local` sets `NEXT_PUBLIC_API_BASE_URL=/v1`. Use the proxied URL, not port 3000, for account/vault operations: the API does not currently enable CORS and Next.js has no API rewrite configured.

Check the API at http://localhost:4000/healthz; it returns `{"status":"ok"}`. Register a test account, create a vault with a different master password, and save the displayed Recovery Kit before adding test items. Stop each process with Ctrl+C; restarting the API resets all data.

### Docker alternative for the API

Replace terminal 1 with:

```sh
BACKEND_PORT=4000 docker compose up --build
```

The web and local Caddy processes still run on the host. Compose starts only the backend, not the clients or a database. Stop it with `docker compose down`. The existing image pins an older Node version than the backend test toolchain supports; review the [Docker caveats](docs/ops/docker-and-vps.md#local-backend-container) before relying on it.

For backend-only use, plain `docker compose up --build` exposes port 3000. No `.env` is required unless overriding defaults.

### Mobile

The Flutter sources do not include `android/` or `ios/` runners. Follow the [mobile setup](mobile/README.md#setup) to generate and configure them first. With the API on port 4000, run from `mobile/`:

```sh
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/v1
```

This URL is for an Android emulator. Use `http://localhost:4000/v1` for an iOS Simulator or a reachable host address for a physical device. Native clients connect directly to the API and do not need the browser proxy.

## Configuration changes

| Configuration | Where to set it | When it takes effect |
|---|---|---|
| API port | `PORT` in the backend process environment; default `3000` | Restart API; data is lost |
| Docker host port | `BACKEND_PORT` in the shell or root `.env`; default `3000` | Recreate the Compose service |
| API auth/sync settings | Process environment, or root `.env` for local Compose | Restart/recreate API; [full reference](backend/README.md#configuration) |
| Browser API base | `web/.env.local`: `NEXT_PUBLIC_API_BASE_URL=/v1` for the local proxy | Restart `next dev`; rebuild production web output |
| Local browser proxy | `deploy/Caddyfile.local`: API `4000`, web `3000`, entry point `8080` | Restart Caddy after changing ports |
| Mobile API base | `--dart-define=API_BASE_URL=.../v1`, no trailing slash | Rebuild/relaunch the app |
| VPS domain/secrets | `backend.env`, copied from root `.env.example` | See [VPS prerequisites](docs/ops/docker-and-vps.md#vps-configuration-not-production-ready) |

Root `.env` is a Compose interpolation file, **not** automatically loaded by `npm run dev` in the backend. There is no `backend/.env.example`. `NEXT_PUBLIC_*` values are included in browser bundles: never put secrets there. Keep populated environment files out of Git.

## Develop

Run these from the repository root after dependency installation:

| Purpose | Backend | Web |
|---|---|---|
| Tests | `npm test --prefix backend` | `npm test --prefix web` |
| Watch tests | `npm run test:watch --prefix backend` | `npm run test:watch --prefix web` |
| Type check | `npm run typecheck --prefix backend` | `npm run typecheck --prefix web` |
| Lint | No lint script | `npm run lint --prefix web` |
| Build | `npm run build --prefix backend` | `npm run build --prefix web` |
| Serve built output | `PORT=4000 npm start --prefix backend` | `npm start --prefix web -- --port 3000` |

For mobile, run `flutter analyze` and `flutter test` from `mobile/`. Test changes on real devices for platform integrations; unit tests do not establish biometric or secure-storage guarantees.

Commit the relevant npm lockfile with dependency changes. When changing API shapes or crypto formats, update both clients and their tests; models are currently maintained separately. Build output is not a deployment, and this repository has no CI or automatic deployment pipeline.

## Documentation

The [documentation index](docs/README.md) links current architecture, API/crypto details, UX behavior, operations, and historical decisions. Stories and acceptance criteria belong in the MVP plan, not setup guides; ADRs retain the reasons behind past choices rather than serving as a current feature checklist.
