# Backend

TypeScript/Express sync API for account authentication, vault KDF metadata, and opaque encrypted items. The current server uses `InMemoryDocumentStore`: **all data is lost on restart**, including accounts and refresh tokens. There is no database URL or persistent-storage switch.

See the [root quick start](../README.md#run-locally) to run the API with either client, and [operations](../docs/ops/docker-and-vps.md) for containers.

## Development

Use Node.js 22.12+ on 22.x, or 24.x, and npm. From `backend/`:

```sh
npm ci
PORT=4000 npm run dev
```

Without `PORT`, the server listens on 3000. The root setup reserves 3000 for Next.js and uses 4000 for the API. `/healthz` returns `200 {"status":"ok"}` without authentication.

| Command | Purpose |
|---|---|
| `npm run dev` | Watch source using `tsx` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run compiled `dist/server.js`; build first |
| `npm test` | Run Vitest/Supertest API tests |
| `npm run test:watch` | Watch tests |
| `npm run typecheck` | Check TypeScript without emitting files |

Tests cover authentication, ownership isolation, KDF bootstrap, item revisions/conflicts, and change-feed/tombstone behavior. There is no backend lint script.

## Configuration

The backend reads its **process environment**. It does not load `.env` files itself. Supply variables in the launching shell or through Compose; root `.env.example` is the Compose template.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | Unset for direct npm commands | `production` rejects the built-in development JWT secret |
| `JWT_SECRET` | `dev-insecure-secret-change-me` | Signs/verifies access tokens; replace with a strong generated secret outside local development |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access-token lifetime in seconds |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh-token lifetime in seconds |
| `CHANGE_FEED_PAGE_SIZE` | `50` | Maximum records returned per change-feed page |
| `CHANGE_FEED_RETENTION` | `1000` | Parsed configuration only; not wired into runtime compaction/expiry |

Restart the process after changes. This resets the in-memory store. TTL/page-size/retention values are parsed as positive integers and otherwise fall back to defaults; use whole positive numbers. `PORT` is parsed separately. The production guard checks the known development JWT value, not secret strength, so operators must validate the replacement.

`BACKEND_PORT` is a Compose **host-port mapping**, not an application setting. Local Compose fixes the container port at 3000. The web client requires a same-origin proxy because this app has no CORS middleware; the root quick start supplies one without changing the API.

## API

Paths below include `/v1`. Send JSON request bodies with `Content-Type: application/json`. `/v1/me`, `/v1/vault/*`, and `/v1/items*` require an Authorization header with the `Bearer` scheme and an access token. `/healthz` and `/v1/auth/*` do not require that header; refresh/logout use a refresh token in the body.

Ownership is derived from the verified access token. Item upserts reject a body containing `ownerId`, even when it matches the caller.

### Account authentication

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/auth/register` | `{ email, password }` | `201 { userId }`; duplicate email: `409 { error: "email_already_registered" }` |
| `POST /v1/auth/login` | `{ email, password }` | `200 { accessToken, refreshToken, expiresIn }`; failure: `401 { error: "invalid_credentials" }` |
| `POST /v1/auth/refresh` | `{ refreshToken }` | `200` token pair; invalid token: `401 { error: "invalid_refresh_token" }` |
| `POST /v1/auth/logout` | `{ refreshToken }` | `204`, revokes that refresh token |
| `GET /v1/me` | No body | `200 { userId }` |

`password` is the account-login password, never the vault master password. Account passwords are hashed with Node's built-in scrypt. Refresh tokens rotate on use; logout does not immediately invalidate an already-issued access token. Login failure uses a generic credential error, but registration reports duplicate emails.

### Vault bootstrap

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/vault/kdf` | `{ salt, kdfParams, kdfParamsVersion? }` | `201 { saltRef, salt, kdfParams, kdfParamsVersion }`; repeat setup: `409 { error: "vault_already_provisioned" }` |
| `GET /v1/vault/kdf` | No body | `200 { provisioned: false }` or `200 { provisioned: true, saltRef, salt, kdfParams, kdfParamsVersion }` |

The POST response does **not** include `provisioned`. These routes store only salt/KDF metadata. Clients synchronize wrapped vault keys through the reserved `__vault_meta__` item; see the [technical reference](../docs/design/mobile-secret-manager-technical-design.md#cross-device-vault-key-sync).

### Items and change feed

| Method and path | Request | Response |
|---|---|---|
| `PUT /v1/items/:itemId` | `{ expectedRevision, ciphertext, nonce, algo, kdfParams?, schemaVersion }` | `201` new item or `200` updated item; stale revision: `409 { error: "version_conflict", yourItem, serverItem }` |
| `GET /v1/items/:itemId` | No body | `200` item; missing: `404 { error: "not_found" }`; deleted: `410 { error: "gone" }` |
| `DELETE /v1/items/:itemId` | `{ expectedRevision }` | `200` tombstone; missing/deleted/conflict: `404`/`410`/`409` |
| `GET /v1/items?cursor=0` | Non-negative integer cursor | `200 { items, nextCursor, hasMore }`; invalid cursor: `400`; expired cursor: `410 { error: "cursor_expired", requiresFullResync: true }` |

Use `expectedRevision: 0` for creation, or the last server revision for updates/deletes. A successful write increments `revision` and the owner's `changeSeq`. An upsert with a tombstone's current revision can restore that item.

An item response contains `itemId`, `ownerId`, `ciphertext`, `nonce`, `algo`, `kdfParams`, `schemaVersion`, `revision`, `createdAt`, `updatedAt`, `deletedAt`, and `changeSeq`. A delete sets `deletedAt` and clears `ciphertext`, `nonce`, `algo`, and `kdfParams` to `null`.

The feed returns the latest state of each item changed after the cursor, in ascending change-sequence order, including tombstones. Omitted cursor starts at zero. Follow `nextCursor` while `hasMore` is true; the page-size heuristic can require one final empty page. It is not an append-only history of every edit.

Current runtime code does not advance the retention floor. Tests can raise it to exercise expiry, but once raised it also rejects cursor zero; do not assume the advertised full-resync recovery path works with a compacted store. Implement and test that path before adding retention to a persistent adapter.

### Errors

Route errors use a string code, for example `{ error: "validation_error", message: "..." }`; `message` is not present on every error. Conflict and cursor-expiry errors include the extra fields shown above. Unexpected failures return `500 { error: "internal_error" }`. Clients should inspect status and error code, not parse human-readable messages.

## Code map and extension points

| Path | Responsibility |
|---|---|
| `src/server.ts`, `src/config.ts` | Startup and environment configuration |
| `src/app.ts`, `src/routes/`, `src/middleware/` | Express wiring, routes, authentication |
| `src/services/` | Account, vault, and sync behavior |
| `src/store/documentStore.ts` | Document-store interface |
| `src/store/inMemoryStore.ts` | Current single-process storage and sequence helpers |
| `src/types.ts` | Stored record and response types |
| `tests/` | API behavior tests |

A durable adapter needs conditional writes and account-scoped sequencing, not just a database container. `createApp` and `ItemsService` currently depend on `InMemoryDocumentStore`, including helpers outside the interface, so replacement also requires wiring/type changes. Add tests against the real adapter before relying on concurrency or retention guarantees.

Keep plaintext vault fields, master passwords, recovery keys, and raw vault keys out of routes, logs, and stored records. Production hardening, rate limiting, persistent storage, and operational monitoring remain follow-up work; a successful build is not a security review.
