# ADR-0003: Minimal Custom Sync Backend Storing Only Encrypted Blobs

Status: Superseded in part by ADR-0006 (`0006-typescript-api-nosql-store.md`) — storage-engine clause only; API/auth/conflict contract below remains authoritative.

> **Note (partially superseded):** the product owner has mandated a NoSQL
> document store, overriding only this ADR's storage-engine clause ("a
> standard relational store (e.g., Postgres/SQLite)" below). The API
> contract, auth model, optimistic-concurrency/conflict semantics, and
> change-feed/tombstone design remain authoritative and are restated in
> document-store terms in ADR-0006.

## Context

ADR-0001 established that the backend must never see plaintext. The
remaining decision is what that backend actually is: build one from scratch,
or adopt/self-host an existing open-source secret-manager server (the
research brief explicitly raised Vaultwarden/Bitwarden-compatible servers as
an option).

Drivers:
- Minimize operational burden for what is currently a single-user system.
- Avoid reinventing well-solved problems (auth, encrypted-blob storage) where
  a mature project already exists.
- Keep a clear path to multi-device sync without taking on unnecessary
  protocol complexity (e.g., full Bitwarden API compatibility is large).
- Reversibility: because secrets are encrypted client-side, the backend is
  swappable later without re-architecting clients, provided the storage
  contract (ADR-0001 blob model) is stable.

## Decision

Build a **minimal custom backend** whose only job is: authenticate the user,
store/retrieve opaque encrypted item blobs keyed by ID, track revisions for
conflict detection, and never process secret content. Concretely:

- A thin HTTP API (REST, JSON) backed by a standard relational store
  (e.g., Postgres/SQLite) with an item table shaped as: `(item_id, owner_id,
  ciphertext, nonce, algo, kdf_params, revision, updated_at, schema_version,
  deleted_at, change_seq)`. The backend derives `owner_id` from the
  authenticated principal and scopes every item operation, including conflict
  responses, to that principal. Clients cannot use `owner_id` to claim or
  access another account's records.

  > **Superseded by ADR-0006**: the storage engine is now a NoSQL document
  > store (the `item` table above becomes an `items` document collection with
  > the same fields); the relational-store detail here is historical only.
- Account-level KDF bootstrap metadata (Argon2id parameters and the actual
  per-user salt) is stored separately as `(owner_id, salt_ref, salt,
  kdf_params, updated_at)` and returned by authenticated
  `GET /v1/vault/kdf` before vault unlock as `{ saltRef, salt, kdfParams }`.
  A new device can derive the vault key without resolving a client-only
  `saltRef`; vault setup stores a client-generated salt and KDF parameters,
  never the master password or derived key.
- Item ciphertext is authenticated with associated data formed from the
  RFC 8785 canonical serialization of `{ ownerId, itemId, algo,
  schemaVersion }`, using the authenticated owner and stable item/envelope
  fields, preventing valid ciphertext from being replayed under another item
  or envelope context.
- Authentication is separate from the secret-encryption key (see ADR-0004):
  the backend only verifies "is this user allowed to read/write this
  blob," using normal session/auth tokens — it is not a cryptographic
  trust boundary for the secret contents.
- Sync/conflict resolution: optimistic concurrency via per-item `revision`
  number and an account-scoped change sequence for the paginated change feed;
  client-side last-write-wins with conflict surfaced to the user when
  revisions diverge (not silently overwritten), given this is single-user
  (not concurrent-editor) scope per research. Deletes create tombstones in
  that feed; a feed without a cursor starts at sequence zero and includes the
  latest state of every item, including tombstones. Cursor expiry requires a
  full resync that includes tombstones.

## Alternatives Considered

| Alternative | Rejected (for now) because |
|---|---|
| Self-host Vaultwarden (Bitwarden-compatible server) | Fastest path to a working synced backend and reuses a widely used, audited project — a strong option if scope grows to team/sharing features. Not chosen now because: (a) it pulls in a full Bitwarden-protocol surface (orgs, policies, attachments) far beyond current single-user scope, increasing operational/learning overhead; (b) it is a Rust codebase unrelated to the chosen TypeScript core, making custom extensions (e.g., bespoke mobile UX) harder; (c) adopting it is still viable later since clients only depend on the abstract `SyncTransport` interface (ADR-0002), keeping this reversible. |
| Serverless managed storage (e.g., a cloud object store + managed auth) directly from clients, no custom API | Reduces backend code to near zero, but couples clients directly to a vendor's storage/auth model, complicating the clean `SyncTransport` abstraction and vendor portability; also complicates server-side revision/conflict bookkeeping. |
| Fully custom backend with its own novel sync protocol (CRDT-based) | Overkill for current single-user scope; CRDT merge adds real complexity research did not establish a need for (no stated multi-concurrent-editor requirement). |

## Consequences

**Positive**
- Small, auditable backend surface — easier to reason about what it can and
  cannot access (it genuinely cannot read secrets).
- Full control over API shape tailored to the mobile+web clients actually
  being built, rather than conforming to an external protocol.
- Clear extraction/adoption path: if team/sharing requirements emerge later,
  this ADR's revisit trigger below names Vaultwarden adoption explicitly as
  the fallback, since clients already sit behind an abstract transport
  interface.

**Negative**
- Backend engineering (auth, storage, revisioning) is now the team's
  responsibility rather than inherited "for free" from an existing project.
- No existing ecosystem (browser extensions, CLI tools) that come bundled
  with adopting an established protocol like Bitwarden's.

## Risks and Mitigations

- **Backend becomes a bottleneck for future protocol needs** (e.g.,
  real-time push sync). Mitigation: start with simple polling/pull-on-open
  sync; add push (e.g., WebSocket/SSE "item changed" notification carrying
  no payload) only if latency becomes a real user complaint.
- **Auth token compromise still reveals metadata and permits blob
  read/write**, though not plaintext. Mitigation: standard token hygiene
  (short-lived access tokens, refresh tokens, revocation list) — not a
  cryptographic secret-confidentiality control, just normal access control.

## Migration, Rollout, and Rollback

- Net-new backend; no migration needed.
- Rollout: backend API and storage schema should be versioned from day one
  (`/v1/...`) to allow additive, non-breaking evolution.
- Rollback/pivot: because the client-side `SyncTransport` interface
  (ADR-0002) is the only coupling point, swapping this backend for an
  adopted project (e.g., Vaultwarden) later requires writing a new
  transport adapter, not rewriting client crypto or UI.

## Validation

- Integration tests asserting the API never stores/returns a field that
  isn't the opaque ciphertext blob (i.e., no accidental plaintext field).
- Load/latency test for sync pull on typical vault sizes (hundreds of
  items) to confirm polling-based sync is acceptable before investing in
  push.

## Revisit Triggers

- Requirement for multi-user sharing/teams emerges → re-evaluate adopting
  Vaultwarden/Bitwarden-compatible protocol instead of extending the custom
  one.
- Need for real-time collaborative editing → revisit CRDT-based sync.
- **(Occurred)** Product direction mandated a NoSQL store — see ADR-0006,
  which supersedes this ADR's storage-engine clause.
