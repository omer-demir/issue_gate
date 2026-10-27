# Web client

Next.js 15 App Router, React 19, and TypeScript client. Vault encryption runs in the browser through Web Crypto, not in Next.js server components or the API. Mobile has a separate Dart implementation; no UI or business-logic source is shared.

## Setup

Use Node.js 22.12+ on 22.x, or 24.x, and npm. From `web/`:

```sh
npm ci
cp .env.example .env.local
npm run dev -- --port 3000
```

Also start the API on port 4000 and the local Caddy proxy as shown in the [root quick start](../README.md#backend-and-web). Open **http://localhost:8080**, not the direct Next.js port, to use the API.

The API has no CORS middleware and `next.config.ts` has no API rewrites. The local proxy keeps browser requests on the same origin: `/v1/*` goes to Express and other paths go to Next.js. Native mobile clients do not need this proxy.

## Configuration

`NEXT_PUBLIC_API_BASE_URL` is the only application-specific browser environment variable. The client appends paths such as `/auth/login` and `/items`, so the base must include `/v1` and must not end with `/`.

| Setting | Use |
|---|---|
| `/v1` | Recommended with the local proxy or an equivalent same-origin deployment |
| `https://api.example.com/v1` | Separate API origin; requires an explicitly configured CORS policy not supplied by this backend |
| Unset | Code falls back to `http://localhost:4000`, which lacks `/v1` and is not a working setup for the current backend |

Copying `.env.example` avoids that fallback. Restart the dev server after editing `.env.local`. Next.js embeds `NEXT_PUBLIC_*` values into production browser bundles at build time: rebuild when changing the API base. These values are public and must never contain credentials or signing secrets.

Web Crypto and clipboard APIs require a secure browser context. Localhost is suitable for local development; use HTTPS for remotely hosted or LAN-accessed browser sessions. Do not disable browser security to work around CORS or mixed-content errors.

## Development commands

Run from `web/`:

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm start` | Serve the existing production build |
| `npm run lint` | ESLint with Next.js/TypeScript rules |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Vitest and React Testing Library tests |
| `npm run test:watch` | Watch tests |

Use the same API/proxy setup for local `build`/`start`. Existing tests cover crypto, password-strength feedback, and the secret form; they are not end-to-end coverage of login, recovery, or sync.

## Code map

| Path | Responsibility |
|---|---|
| `src/lib/api.ts`, `src/lib/types.ts` | HTTP client and manually maintained wire types |
| `src/lib/crypto.ts` | KDF, AES-GCM, DEK wrapping, recovery-key generation |
| `src/store/SessionProvider.tsx` | Account tokens/session in `sessionStorage` |
| `src/store/VaultProvider.tsx` | In-memory unlocked key, items, pending edits, conflict handling |
| `src/app/` | Register/login, setup/unlock/recovery, and secret CRUD pages |
| `src/components/` | Forms, feedback, clipboard, and conflict UI |

### Cross-device vault key sync

Both clients use a reserved `__vault_meta__` item for master-password and Recovery Kit DEK wraps. The [technical reference](../docs/design/mobile-secret-manager-technical-design.md#cross-device-vault-key-sync) owns the format and compatibility rules. The [backend API reference](../backend/README.md#api) owns request/response shapes.

## Current limitations

The unlocked DEK is held in memory and cleared on lock/sign-out, not persisted to browser storage. The item cache and pending queue are also in memory: reloads or closing the tab lose pending work, and there is no IndexedDB-backed offline vault. Existing sessions use their initial access token rather than automatically refreshing it; an expired token requires signing in again.

PBKDF2-SHA256 is implemented; Argon2id and shared Dart/TypeScript compatibility vectors are not. Clipboard clearing after 30 seconds is best-effort because browser permissions, focus, and background scheduling can prevent it. Biometric unlock is mobile-only.

For manual review, exercise registration, setup/Recovery Kit acknowledgment, lock/unlock, CRUD, recovery, two-session conflicts, expired tokens, and offline/reconnect behavior with disposable data. Do not treat the current crypto tests as cross-platform or production-security certification.
