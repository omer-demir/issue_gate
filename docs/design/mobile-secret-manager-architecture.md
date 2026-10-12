# Design — Mobile Secret Manager (Passwords & Login Details)

Status: Proposed (ideation stage — architecture decisions)

## 1. Decision Summary

The repository is greenfield (verified: only `README.md` exists; single
`Initial commit`). Four foundational architecture decisions are recorded as
ADRs and summarized here:

1. **Client-side, zero-knowledge encryption** — the sync backend only ever
   stores/transmits opaque ciphertext. (ADR-0001)
2. **Shared TypeScript core + React Native mobile client + web client** —
   one audited implementation of crypto/sync logic, thin platform shells.
   (ADR-0002)
3. **Minimal custom sync backend** storing encrypted blobs with
   revision-based optimistic concurrency, not an adopted Bitwarden-compatible
   server (deferred as a fallback). (ADR-0003)
4. **Master-password-derived vault unlock, decoupled from account auth**,
   with OS-biometric-gated local key caching on mobile. (ADR-0004)

Together these answer the research brief's open questions 1, 3, 4, and 5
directly; questions 2 (sharing/teams), 6 (offline conflict depth), 7
(compliance/audit/export), and 8 (timeline/MVP scope) remain explicitly
open and are listed under Open Questions below, since resolving them is not
required to make the current architecture decisions and the chosen design
keeps those paths open rather than foreclosing them.

## 2. Current State and Constraints

- File/symbol evidence: `list_files` on repo root returns only
  `README.md`; `docs/` did not exist prior to this stage. No existing code,
  schema, or conventions to extend or conflict with.
- Constraint carried from research: data sensitivity (passwords/login
  credentials) demands the server never hold plaintext or derivable keys —
  this is the single hardest constraint shaping every option below.
- Constraint: initial scope is single-user (per research brief inference),
  which rules out needing a CRDT-grade sync protocol today but should not be
  architecturally foreclosed later.

## 3. Options Comparison (Top-Level Architecture)

| Dimension | Option A: Build custom (chosen) | Option B: Adopt Vaultwarden/Bitwarden-compatible | Option C: Fully native apps + custom backend |
|---|---|---|---|
| Correctness/consistency | Full control, but team must implement/own crypto+sync correctness (mitigated by shared core, ADR-0002) | Inherits a widely audited, mature protocol and server | Same crypto risk as A, tripled across 3 native codebases |
| Consumer compatibility | Clients only exist for this product; no third-party ecosystem compatibility | Compatible with existing Bitwarden clients/extensions out of the box | Same as A |
| Security and isolation | Zero-knowledge maintained by design (ADR-0001) | Zero-knowledge maintained (Bitwarden's model is also client-side encrypted) | Same as A |
| Reliability | Backend scope is small, easier to reason about failure modes | Inherits a mature, battle-tested server, but with features/complexity beyond current needs (orgs, policies) | Same backend as A; mobile reliability improves slightly with native modules |
| Observability | Full control over logging/metrics design from scratch | Must learn/operate an external project's observability model | Same as A |
| Operational complexity | Low-moderate; small API + DB | Low to run, but protocol compliance/version upgrades add overhead | Highest: 3 codebases to build/release/support |
| Cost | Low infra cost (single small service) | Low infra cost, but ongoing upstream-compatibility maintenance | Highest engineering cost (3x client codebases) |
| Reversibility | High — `SyncTransport` abstraction (ADR-0002) allows swapping backend later | Adopting later remains possible; named as explicit fallback (ADR-0003 revisit trigger) | Mobile-only native rewrite remains possible later if React Native proves limiting (ADR-0002 rollback) |

**Decision**: Option A (custom backend + React Native/web shared-core
clients), with Option B named as the explicit fallback if sharing/teams
scope emerges, and Option C's mobile-only variant named as the explicit
fallback if deep OS integration needs exceed React Native's bridging
capability.

## 4. Interfaces and Contracts

### 4.1 Encrypted Item Envelope (client ⇄ client, via backend storage)

```ts
// Shared core type — the only shape the backend ever stores/returns.
interface EncryptedItemEnvelope {
  itemId: string;        // opaque UUID, client-generated
  ownerId: string;       // account identifier (not secret)
  ciphertext: string;    // base64, AEAD output (includes auth tag)
  nonce: string;         // base64, unique per encryption
  algo: "xchacha20poly1305" | "aes256gcm"; // versioned, extensible
  kdfParams: { algo: "argon2id"; memKiB: number; iterations: number; parallelism: number; saltRef: string };
  revision: number;      // monotonically increasing per item, optimistic concurrency
  updatedAt: string;     // ISO-8601, backend-assigned on write
  schemaVersion: 1;      // envelope format version for forward compatibility
}
```

Invariants:
- `ciphertext`/`nonce` are opaque to the backend; backend MUST NOT attempt
  to parse or index their content.
- `revision` is compared on write: client must send the `revision` it last
  read; a mismatch is rejected (see error semantics) rather than silently
  overwritten.
- Decrypted plaintext (item title, username, password, URL, notes) is a
  client-side-only type, never defined in the backend's schema.

### 4.2 Sync API (backend ⇄ clients), `v1`

```
GET  /v1/items                  → list EncryptedItemEnvelope[] for the authenticated owner, paginated
GET  /v1/items/:itemId          → single EncryptedItemEnvelope
PUT  /v1/items/:itemId          → upsert; body includes `revision` (expected prior revision)
DELETE /v1/items/:itemId        → tombstone delete (soft-delete + revision bump, enables sync of deletions)
```

Error semantics:
- `409 Conflict` — `revision` mismatch; response includes the current
  server-side envelope so the client can surface a merge/overwrite prompt
  to the user (per ADR-0003, no silent last-write-wins across devices).
- `401 Unauthorized` — account-auth token invalid/expired; distinct from
  any vault-unlock failure, which is a purely client-side concept the
  backend never observes (ADR-0004).
- `410 Gone` — item previously tombstoned; included so clients can
  reconcile local caches without re-creating deleted items.
- All error bodies: `{ "error": { "code": string, "message": string } }`,
  no secret-derived content ever included.

Versioning/compatibility: path-versioned (`/v1/...`); envelope carries its
own `schemaVersion` so the client core can run decrypt-time migrations
(e.g., re-derive with new KDF params) independent of the API version.

### 4.3 Client Core Adapter Interfaces (ADR-0002 boundary)

```ts
interface SecretStorageAdapter {
  getCachedMasterKey(): Promise<Uint8Array | null>;   // from OS Keychain/Keystore (mobile) or in-memory (web)
  setCachedMasterKey(key: Uint8Array, opts: { biometricGate: boolean }): Promise<void>;
  clearCachedMasterKey(): Promise<void>;
}

interface SyncTransport {
  listItems(cursor?: string): Promise<{ items: EncryptedItemEnvelope[]; nextCursor?: string }>;
  upsertItem(env: EncryptedItemEnvelope): Promise<EncryptedItemEnvelope>; // throws on 409 with server envelope attached
  deleteItem(itemId: string, revision: number): Promise<void>;
}
```

Ownership: the core package owns `EncryptedItemEnvelope`, encryption/KDF
functions, and these two adapter interfaces. Each platform shell owns only
its adapter *implementation* (Keychain/Keystore bridge; HTTP client).

## 5. Risks, Open Questions, and Handoff Notes

### Carried-forward and new risks
- Clipboard exposure on copy/paste (flagged in research) — **not yet
  resolved by this stage**; needs a UX/implementation decision (e.g.,
  auto-clearing clipboard after N seconds) in the next (definition/
  implementation-planning) stage.
- Recovery-kit UX (ADR-0001) is named but not designed in detail — needs a
  dedicated UX design pass.
- Backend account-auth mechanism (password hashing scheme, token
  lifetimes/rotation) is intentionally left generic in ADR-0004 and the API
  contract above; needs a dedicated decision before implementation.

### Open questions (from research, still unresolved by this stage)
1. Sharing/teams scope (research Q2) — affects whether ADR-0003's
   Vaultwarden fallback should be pulled forward.
2. Depth of offline support/conflict UX beyond basic revision-conflict
   surfacing (research Q6).
3. Compliance/audit-logging/export requirements (research Q7).
4. MVP scope and timeline (research Q8) — affects whether biometric
   caching, recovery kits, and tombstone sync all ship in v1 or are phased.

### Handoff notes for planning/implementation agents
- Start with the shared core package (crypto + envelope + adapter
  interfaces) and its test suite before any UI work, per ADR-0002 rollout
  order.
- The backend's `v1` API and DB schema in §4.2 are implementation-ready
  contracts; implement the DB table as `(item_id, owner_id, ciphertext,
  nonce, algo, kdf_params, revision, updated_at, schema_version,
  deleted_at)`.
- Do not implement account-auth password storage without a dedicated ADR
  (e.g., bcrypt/argon2id for account passwords, token rotation policy) —
  flagged above as unresolved.
- Resolve the four open questions above during definition/scoping before
  committing to a full feature list; none of them block starting on the
  core crypto/sync foundation described here.
