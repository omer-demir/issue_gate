# Mobile Secret Manager — Backend (sync service)

Implements MSM-10 through MSM-13 of `docs/plan/mobile-secret-manager-mvp.md`:
a minimal custom sync backend that authenticates users and stores/retrieves
**opaque ciphertext item blobs** with optimistic-concurrency conflict
detection and a cursor-paginated change feed. Per ADR-0001, this service
**never sees plaintext secrets, the master password, or any derived
encryption key** — only ciphertext and non-secret metadata ever reach it.

Stack: Node.js + TypeScript (ADR-0006), Express. Storage: a `DocumentStore`
port (`src/store/documentStore.ts`) modeled after a NoSQL document store per
ADR-0006; `InMemoryDocumentStore` is the MVP/dev/test implementation. Swap in
a real vendor (DynamoDB/Firestore/MongoDB) by implementing the same
interface — no service/route code changes required.

## Running

```sh
npm install
npm run dev        # ts-node/tsx dev server on :3000
npm run build       # tsc -> dist/
npm start           # node dist/server.js
npm test            # vitest (31 tests across auth/vault/items/change-feed)
npm run typecheck
```

## Running with Docker

A `Dockerfile` here builds a production-style image (multi-stage, non-root).
For local Compose-based bring-up (default) and an optional later VPS path,
see [`docs/ops/docker-and-vps.md`](../docs/ops/docker-and-vps.md); quick
start from the repo root:

```sh
docker compose up --build
```

Environment variables (all optional in dev, `JWT_SECRET` required in
`NODE_ENV=production`):

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | `dev-insecure-secret-change-me` | Access-token signing secret |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access-token lifetime |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh-token lifetime |
| `CHANGE_FEED_PAGE_SIZE` | `50` | Max items per change-feed page |
| `CHANGE_FEED_RETENTION` | `1000` | Modeled retention window before a cursor is considered expired |
| `PORT` | `3000` | HTTP listen port |

## API (`/v1`)

All endpoints except `/healthz` and `/v1/auth/*` require
`Authorization: Bearer <accessToken>`; `ownerId` is always derived from the
verified token, never from the request body.

### Auth (MSM-10)
- `POST /v1/auth/register` `{ email, password }` → `201 { userId }`
- `POST /v1/auth/login` `{ email, password }` → `200 { accessToken, refreshToken, expiresIn }` or `401 { error: "invalid_credentials" }` (generic — no user-enumeration signal)
- `POST /v1/auth/refresh` `{ refreshToken }` → `200 { accessToken, refreshToken, expiresIn }` (rotate-on-use: the old refresh token is revoked)
- `POST /v1/auth/logout` `{ refreshToken }` → `204`

### Vault bootstrap (MSM-11)
- `POST /v1/vault/kdf` `{ salt, kdfParams, kdfParamsVersion? }` → `201` the stored KDF record, or `409 { error: "vault_already_provisioned" }`
- `GET /v1/vault/kdf` → `200 { provisioned: false }` or `200 { provisioned: true, saltRef, salt, kdfParams, kdfParamsVersion }`

### Items (MSM-12)
- `PUT /v1/items/:itemId` `{ expectedRevision, ciphertext, nonce, algo, kdfParams?, schemaVersion }` → `201` (created) / `200` (updated) item, or `409 { error: "version_conflict", yourItem, serverItem }` on a stale `expectedRevision`
- `GET /v1/items/:itemId` → `200` item, `404 { error: "not_found" }`, or `410 { error: "gone" }` if tombstoned
- `DELETE /v1/items/:itemId` `{ expectedRevision }` → `200` tombstone record, `404`, `410`, or `409 version_conflict`

### Change feed (MSM-13)
- `GET /v1/items?cursor=<changeSeq>` → `200 { items, nextCursor, hasMore }` (items changed after `cursor`, ascending, including tombstones); omitted cursor starts a full resync from `0`. An invalid cursor returns `400`; an expired cursor (older than the retained window) returns `410 { error: "cursor_expired", requiresFullResync: true }`.

## Known MVP limitations (flagged for follow-up, non-blocking)

- Account-password hashing uses Node's built-in `scrypt` rather than a
  dedicated Argon2id library, since this backend installs no native crypto
  bindings; swap in a vetted Argon2id package if the deployment environment
  supports native modules.
- `InMemoryDocumentStore` is not durable/distributed; production deployment
  (MSM-17, infrastructure scope) must supply a real NoSQL-backed
  `DocumentStore` implementation.
- The change-feed `hasMore` flag is a conservative heuristic
  (`page.length === pageSize`); it may indicate one more page than strictly
  necessary but never causes a gap or duplicate-skipped tombstone.
- Observability (dashboards/alerting) is infrastructure scope (MSM-19); this
  service only guarantees its error logging never includes request/response
  bodies (which may carry ciphertext or tokens).
