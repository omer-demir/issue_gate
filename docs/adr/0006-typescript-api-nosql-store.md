# ADR-0006: API and Storage — TypeScript API Service with NoSQL Document Store

Status: Proposed

## Context

`0003-minimal-custom-sync-backend.md` decided a minimal custom sync backend
(authenticate the user, store/retrieve opaque encrypted item blobs, track
revisions for conflict detection) backed by "a standard relational store
(e.g., Postgres/SQLite)" with a single `item` table, and left the API
implementation language unspecified.

An authoritative product-owner directive has since been made: implement the
API in **TypeScript**, and use a **NoSQL** store. This ADR records that
decision. It does not relitigate ADR-0003's API/behavioral contract (auth
separated from the vault key, ciphertext-only storage, revision-based
optimistic concurrency, versioned `/v1/...` API, change-feed/tombstone
semantics) — that contract remains authoritative. Only the implementation
language and the storage engine change.

Drivers:
- **Explicit product direction** overrides ADR-0003's storage-engine choice;
  recorded here as the reconciling decision.
- **Consistency with ADR-0005**: Next.js and the client/API contract package
  are TypeScript. Using TypeScript for the API lets it directly consume the
  generated OpenAPI types shared with the Next.js web client (and, via
  generated Dart models, the Flutter mobile client), avoiding duplicate type
  definitions for the wire contract.
- **Data-model fit**: ADR-0003's item record is already a single flat,
  self-contained document (`item_id, owner_id, ciphertext, nonce, algo,
  kdf_params, revision, updated_at, schema_version, deleted_at, change_seq`)
  with no cross-item relational joins required by any decided feature — this
  maps directly onto a NoSQL document store's per-item document shape.
- **Team capacity**: a single developer benefits from a managed NoSQL service
  (e.g., DynamoDB, Firestore, MongoDB Atlas) that reduces operational burden
  (schema migrations, connection pooling, backups) versus self-managing
  Postgres, consistent with ADR-0003's "minimize operational burden" driver.

## Decision

1. **API language/runtime**: Node.js with TypeScript. The API consumes the
   same OpenAPI/schema contract defined in ADR-0005 as the single source of
   truth for request/response types, shared with the Next.js web client and
   (via generated Dart models) the Flutter mobile client.
2. **Storage engine**: a document-oriented NoSQL store. The specific vendor
   (e.g., DynamoDB, Firestore, or self-hosted MongoDB) is an implementation
   detail selected by the engineering agent based on hosting constraints, not
   re-litigated here. ADR-0003's `item` table becomes an `items` document
   collection, one document per secret item, keyed by `(ownerId, itemId)`,
   preserving every field and semantic ADR-0003 defined:
   ```
   {
     ownerId, itemId, ciphertext, nonce, algo, kdfParams,
     revision, updatedAt, schemaVersion, deletedAt, changeSeq
   }
   ```
3. **KDF bootstrap metadata** (`owner_id, salt_ref, salt, kdf_params,
   updated_at` from ADR-0003) becomes an `accountKdf` document collection,
   keyed by `ownerId`, unchanged in shape or API (`GET /v1/vault/kdf`).
4. **Conflict detection and change feed**: implemented via per-document
   `revision`/`changeSeq` fields and the storage engine's native
   conditional-write mechanism (e.g., DynamoDB conditional `PutItem`, or
   MongoDB's `findOneAndUpdate` with a revision-match filter), preserving
   ADR-0003's behavior: reject stale writes with `409 version_conflict`, never
   silently overwrite.
5. All other ADR-0003 decisions — auth separate from the vault key (ADR-0004),
   versioned `/v1/...` API, polling-based sync with push deferred, Vaultwarden
   as the escape-hatch fallback — remain unchanged and authoritative.
6. **Supersedes**: `0003-minimal-custom-sync-backend.md`'s storage-engine
   clause only ("a standard relational store (e.g., Postgres/SQLite) with an
   item table"). ADR-0003's API contract, auth model, and conflict semantics
   are restated above in document-store terms and remain in force.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Keep ADR-0003's relational store (Postgres/SQLite) | Directly contradicts the product-owner's explicit NoSQL directive; also unnecessary, since the data model has no relational joins. |
| Serverless managed storage directly from clients, no custom API (ADR-0003's rejected alternative) | Still rejected for the same reason ADR-0003 gave: couples clients to a vendor storage/auth model and complicates server-side revision bookkeeping — unaffected by the SQL→NoSQL change. |
| Non-TypeScript API runtime (e.g., Go, Python) with a NoSQL store | Satisfies the NoSQL directive alone, but forfeits the type-sharing benefit with the Next.js/contract-package stack decided in ADR-0005, with no offsetting benefit identified. |
| Fully custom CRDT-based sync protocol | Still overkill for current single-user scope, per ADR-0003's original reasoning; independent of storage-engine choice. |

## Consequences

**Positive**
- Directly satisfies the product owner's TypeScript-API and NoSQL-store
  directives while preserving all of ADR-0003's proven API and
  conflict-handling design.
- One language (TypeScript) across the API, web client, and contract package
  reduces context-switching and lets the API reuse generated wire types
  directly.
- Managed NoSQL stores typically offer low-ops hosting well-suited to a
  single-developer team, consistent with ADR-0003's operational-burden
  driver.

**Negative**
- Loses relational-database guarantees (ACID multi-row transactions, foreign
  keys, ad hoc `JOIN`-based querying) that Postgres would provide "for free";
  not currently needed, but any future feature requiring multi-item
  transactional consistency (e.g., atomic bulk operations) must be
  implemented in the API layer instead of the database.
- NoSQL conditional-write/optimistic-concurrency patterns are less
  standardized across vendors than SQL transactions, requiring a
  vendor-specific adapter if the chosen engine changes later.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Vendor lock-in to a specific NoSQL engine's API/SDK | Keep all storage access behind a repository/DAO interface in the API codebase; no business logic calls vendor SDKs directly outside that layer. |
| Conditional-write semantics differ subtly per NoSQL vendor, risking conflict-detection bugs | Integration tests (carried over from ADR-0003) assert the exact conflict behavior (reject stale `revision`, return `409 version_conflict`) against the chosen engine, not just unit-test the abstraction. |
| Change-feed pagination/cursor semantics are harder to implement correctly on some NoSQL engines than with a SQL `ORDER BY` + cursor | Choose an engine with native ordered-index/change-stream support (e.g., DynamoDB GSI + sort key, or MongoDB change streams) during implementation; document the chosen engine's pagination guarantees. |

## Migration, Rollout, and Rollback

- Net-new backend; no existing data to migrate (greenfield, consistent with
  ADR-0003).
- Update `Status` in `0003-minimal-custom-sync-backend.md` to note that its
  storage-engine clause is superseded by this ADR; its API/auth/conflict
  contract remains authoritative.
- API stays versioned from day one (`/v1/...`, per ADR-0003), so the storage
  engine can change again later without an API-contract break.
- Rollback/pivot: because clients depend only on the versioned HTTP API
  (never the storage engine directly), swapping the NoSQL vendor — or
  reverting to a relational store if a future requirement needs multi-row
  transactions — requires only a new storage-adapter implementation behind
  the existing repository/DAO interface, not client changes.

## Validation

- Integration tests (carried over from ADR-0003) assert the API never
  stores/returns a field beyond the opaque ciphertext blob and documented
  metadata.
- Conflict/concurrency tests specifically exercise the chosen NoSQL engine's
  conditional-write path under concurrent updates to the same `itemId`.
- Load/latency test for sync pull and change-feed pagination at typical vault
  sizes, per ADR-0003.

## Revisit Triggers

- A future feature requires multi-item atomic transactions or complex
  relational queries the chosen NoSQL engine cannot support efficiently →
  revisit the SQL-vs-NoSQL decision.
- Requirement for multi-user sharing/teams emerges → re-evaluate adopting
  the Vaultwarden/Bitwarden-compatible protocol, per ADR-0003's original
  revisit trigger.
