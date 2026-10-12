# Mobile Secret Manager — MVP Implementation Plan

Status: Draft — blocked on MSM-1 (architecture reconciliation) before any coding story starts.
Prefix: `MSM`. IDs are stable; do not renumber once referenced elsewhere.

## Goal and Scope

**Goal**: ship a working, zero-knowledge, end-to-end MVP secret manager (store/view/create/update
login-detail secrets) spanning Mobile client, Backend sync service, client UI, and Deployment, for
a single user per account (no sharing/teams).

**Actors**: a single account owner using one or more of their own devices.

**Success measures (MVP exit criteria)**:
- A user can create a vault, add/view/edit/delete secrets, and have them sync across two of their
  own devices via the backend, with the backend never able to read plaintext.
- CI builds/tests the backend and mobile app on every change; the backend is deployed to a staging
  environment and the mobile app is distributable to internal testers (store release itself is
  out of scope for MVP exit, see Sequencing).

**Task-wording → discipline mapping** (task asked for "UI, Backend, Mobile and Deployment"; this
plan uses the standard discipline set): **UI → frontend**, **Backend → backend**,
**Mobile → mobile**, **Deployment → infrastructure**.

**In scope**: client-side zero-knowledge crypto, mobile app (onboarding, unlock, CRUD on secrets,
biometric convenience unlock, recovery kit, offline + sync, conflict surfacing), minimal custom
sync backend (account auth, vault bootstrap, item sync API), CI/CD and environments for backend and
mobile.

**Out of scope for this MVP backlog** (carried over from existing design docs, re-confirmed here):
sharing/teams, web client (explicitly phased after mobile per the shared-core ADR's build order —
see Sequencing), compliance/audit-logging/export requirements, real-time push sync, multi-device
"log out other sessions" revocation UI, app-store production release/compliance review.

## Critical Blocker — Unresolved Architecture Conflict (must read before MSM-2+)

Repository investigation (this stage, re-verified against `git log` and file contents) confirms
the prior research finding: **two independent, mutually exclusive architecture decisions exist in
`main`, both merged without reconciliation**:

- **Lineage A (React Native / TypeScript, PR #1, commits `0bdfd0b`/`0625b99`)**: `docs/adr/0001-client-side-zero-knowledge-encryption.md`
  → `docs/adr/0002-cross-platform-client-shared-core.md` (React Native mobile + separate web client,
  shared TypeScript core) → `docs/adr/0003-minimal-custom-sync-backend.md` → `docs/adr/0004-master-password-kdf-unlock-with-biometric-gating.md`,
  synthesized in `docs/design/mobile-secret-manager-architecture.md` with an implementation-ready
  `v1` REST sync API and DB schema (§4.2).
- **Lineage B (Flutter / Dart, PR #2, commit `420d243`)**: `docs/adr/0001-mobile-web-secret-manager-architecture.md`
  (shared Flutter client across iOS/Android/Web + a custom thin ciphertext-relay backend), detailed
  in `docs/design/mobile-secret-manager-technical-design.md` and reconciled with UX in
  `docs/design/mobile-secret-manager-design-handoff.md`.

Both files are numbered `ADR-0001`; neither supersedes the other. **This plan cannot pick the
winning client stack — that is an architecture decision outside this agent's scope.** To keep the
backlog coherent and actionable now, this plan:

1. Treats **MSM-1** (ratify architecture via a superseding ADR) as a hard blocking prerequisite to
   every coding story (MSM-2 onward). No backend/mobile/frontend story should start implementation
   before MSM-1 closes.
2. Uses **Lineage A** as the illustrative technical baseline for API/contract details in this plan
   (sync endpoints, DB shape, adapter boundaries) because it is the more complete, internally
   cross-referenced chain (4 ADRs covering crypto, client stack, backend, and auth) with a
   concrete, implementation-ready `v1` API — **not** because it is hereby decided as final.
3. Reuses the **stack-agnostic product/UX decisions** from Lineage B's handoff doc (Recovery Kit,
   biometric-as-convenience-only, offline/pending-sync behavior, side-by-side conflict resolution,
   separate account-password vs. master-password reset flows) as acceptance criteria throughout,
   since these describe user-facing behavior, not a framework choice, and both lineages agree on
   them.
4. If MSM-1 ratifies Lineage B (Flutter) instead, only the *implementation* detail of stories
   tagged "(Lineage A detail, confirm in MSM-1)" changes (e.g., REST paths, adapter interface
   names); story IDs, acceptance criteria intent, and sequencing below remain valid.

## Story Table

| ID | Title | Disciplines | Depends on |
|---|---|---|---|
| MSM-1 | Ratify client/platform architecture via superseding ADR | none (blocking enabler) | — |
| MSM-2 | Shared crypto/vault core library | frontend, mobile | MSM-1 |
| MSM-3 | Mobile secure-storage and biometric-gating adapter | mobile | MSM-1, MSM-2 |
| MSM-4 | Mobile onboarding: create vault and master password | frontend, mobile | MSM-2, MSM-3 |
| MSM-5 | Mobile vault unlock (master password + optional biometric) | frontend, mobile | MSM-3, MSM-4 |
| MSM-6 | Mobile vault list and view/copy a secret (local-only) | frontend, mobile | MSM-5 |
| MSM-7 | Mobile create/edit/delete a secret (local-only) | frontend, mobile | MSM-6 |
| MSM-8 | Recovery Kit generation and display at onboarding | frontend, mobile | MSM-4 |
| MSM-9 | Vault recovery via Recovery Kit (lost master password) | frontend, mobile | MSM-8 |
| MSM-10 | Backend account registration, login, session | backend | MSM-1 |
| MSM-11 | Backend vault bootstrap endpoint (KDF params issuance) | backend | MSM-10 |
| MSM-12 | Backend sync API: item upsert/read with revision concurrency | backend | MSM-11 |
| MSM-13 | Backend sync API: change feed, cursor pagination, tombstones | backend | MSM-12 |
| MSM-14 | Mobile sync integration: enable sync, offline queue, pending indicator | frontend, mobile | MSM-7, MSM-13 |
| MSM-15 | Conflict resolution UI (409 version_conflict, side-by-side) | frontend, mobile | MSM-14 |
| MSM-16 | CI pipeline: lint/build/test for backend and mobile | infrastructure | MSM-1 |
| MSM-17 | Backend hosting: staging + production environments, config/secrets | infrastructure | MSM-10 |
| MSM-18 | Mobile internal-distribution build pipeline (signing, test track) | infrastructure, mobile | MSM-16, MSM-5 |
| MSM-19 | Backend observability: ciphertext-safe logging, metrics, alerting | infrastructure, backend | MSM-17 |

## Per-Story Details

### MSM-1 — Ratify client/platform architecture via superseding ADR
**Disciplines**: none directly (architecture decision; all four disciplines are blocked by it).
**Outcome**: As the team, we have one authoritative client-stack decision so backend/mobile/UI
work can proceed without contradicting design docs.
**Acceptance criteria**:
1. Given the two conflicting `ADR-0001` files, when this story closes, then a new ADR (e.g.
   `0005-supersede-client-stack-decision.md`) explicitly states which lineage (A or B) is
   authoritative and marks the other `ADR-0001` as superseded in its own file header.
2. Given the decision, when recorded, then it states whether MVP ships mobile-only first with web
   deferred (Lineage A's phase order) or a single shared mobile+web codebase (Lineage B), since this
   changes MSM-14/18 scope.
3. Given MVP-scope ambiguity flagged by prior research (no MVP scope/timeline decision existed),
   when this story closes, then it also confirms or amends the MVP boundary assumed in this plan
   (Story Table + Out of scope section).
**Dependencies**: none. **Non-functional**: none (decision record only).
**Out of scope**: writing or changing any application code.

### MSM-2 — Shared crypto/vault core library
**Disciplines**: frontend, mobile. Backend: not applicable (core never runs server-side).
Infrastructure: not applicable.
**Outcome**: As a client application, I have one audited crypto/vault module so mobile and UI
layers share identical key-derivation, encryption, and envelope logic instead of reimplementing it.
**Acceptance criteria**:
1. Given a master password and a stored KDF salt, when the core derives a key, then it uses
   Argon2id by default with a PBKDF2-SHA256 fallback, and the chosen KDF + params are recorded
   per-vault so later unlocks remain compatible.
2. Given plaintext secret fields, when encrypted, then the core produces an envelope containing
   AES-256-GCM ciphertext, nonce, auth tag, item ID, revision, timestamps, and KDF/schema version,
   with no plaintext field ever included.
3. Given a tampered ciphertext or wrong key, when decryption is attempted, then it fails closed
   (authenticated-cipher tag rejection) and never returns garbage plaintext.
4. Given a data-encryption-key (DEK) wrapped by the master key, when the master password is
   rotated, then only the DEK wrapping is re-encrypted; individual secret items are not
   re-encrypted.
5. The core exposes platform-agnostic adapter interfaces (secure storage, HTTP/sync transport) so
   platform shells implement only the adapter, never crypto logic (ADR-0002 boundary, pending
   MSM-1 confirmation of which language/stack).
**Dependencies**: MSM-1. **Non-functional**: security — use one audited, maintained crypto library,
no hand-rolled primitives; unit tests cover round-trip encrypt/decrypt, tamper-detection, and
KDF-fallback paths.
**Out of scope**: network transport implementation, platform secure-storage implementation (MSM-3).

### MSM-3 — Mobile secure-storage and biometric-gating adapter
**Disciplines**: mobile. Frontend/backend/infrastructure: not applicable.
**Outcome**: As a mobile user, my derived vault key and ciphertext cache are protected by the OS
keystore so a compromised app sandbox alone cannot extract my key material.
**Acceptance criteria**:
1. Given an unlocked vault, when biometric unlock is enabled, then the derived key is cached only
   inside the OS keystore/Secure Enclave (e.g., platform keychain API), gated by biometric prompt,
   and is never written to plain app storage.
2. Given biometric gating is disabled or fails, when the user attempts unlock, then the app falls
   back to the master-password prompt; biometrics is never the sole unlock credential.
3. Given the app is backgrounded or the session ends, when re-opened, then the in-memory key is
   cleared and re-authentication (password or biometric) is required.
4. Given only ciphertext is ever persisted to disk, when the device storage is inspected offline,
   then no plaintext secret or raw master key/DEK is recoverable from app files.
**Dependencies**: MSM-1, MSM-2. **Non-functional**: security — rely on platform-provided
keystore/enclave APIs, document that security assumes an uncompromised OS; no custom native crypto
modules where a maintained library (e.g., keychain wrapper) exists.
**Out of scope**: account-level SSO/passkeys; cross-device key sync (keys are per-device).

### MSM-4 — Mobile onboarding: create vault and master password
**Disciplines**: frontend, mobile.
**Outcome**: As a new user, I can create an account and a vault with a master password so I can
start storing secrets.
**Acceptance criteria**:
1. Given a new user on the onboarding screen, when they set an account password and a separate
   master password, then the UI clearly labels them as two distinct, non-interchangeable secrets
   (account password recoverable via normal reset; master password is not).
2. Given a weak master password, when submitted, then the UI blocks submission with a specific,
   measurable strength requirement (e.g., minimum entropy estimate shown) and explains why.
3. Given successful vault creation, when it completes, then the vault is empty and ready to accept
   items, and the user is routed into the Recovery Kit flow (MSM-8) before first use.
4. Given a network failure during account creation, when it occurs, then the UI shows a retry
   affordance without silently discarding entered data.
**Dependencies**: MSM-2, MSM-3. **Non-functional**: accessibility — form fields and errors are
screen-reader labeled; security — master password never leaves the device unencrypted/undived.
**Out of scope**: backend account-service implementation (MSM-10); this story covers the mobile UI
flow against a (possibly stubbed/mocked) account API until MSM-10 lands.

### MSM-5 — Mobile vault unlock (master password + optional biometric)
**Disciplines**: frontend, mobile.
**Outcome**: As a returning user, I can unlock my vault with my master password, or biometrics if
enabled, so I can access my secrets quickly and safely.
**Acceptance criteria**:
1. Given a locked vault and a correct master password, when submitted, then the vault unlocks and
   the key is held in memory only for the session.
2. Given an incorrect master password, when submitted, then the UI shows a generic failure message
   (no hint distinguishing "wrong password" from "account not found") and does not leak timing
   differences materially.
3. Given biometric unlock is enabled (MSM-3), when the OS biometric prompt succeeds, then the vault
   unlocks without re-entering the master password; when it fails or is cancelled, then the
   password prompt is shown as fallback.
4. Given the app is locked after a timeout or backgrounding, when reopened, then re-authentication
   is required per MSM-3 criterion 3.
**Dependencies**: MSM-3, MSM-4. **Non-functional**: security — no password logged or sent in
analytics; performance — unlock completes within a few seconds on a typical device even with a
memory-hard KDF (document the actual budget once MSM-1/MSM-2 fix KDF parameters).
**Out of scope**: SSO/OAuth-based account login (explicitly rejected as an unlock mechanism by
ADR-0004).

### MSM-6 — Mobile vault list and view/copy a secret (local-only)
**Disciplines**: frontend, mobile.
**Outcome**: As a user, I can see my list of secrets and view/copy a secret's value so I can use my
credentials elsewhere.
**Acceptance criteria**:
1. Given an unlocked vault with items, when the list screen loads, then item titles/metadata render
   without decrypting values until a specific item is opened.
2. Given a user opens an item and taps "copy", when the value is copied, then the OS clipboard is
   marked sensitive where supported and is automatically cleared after a default 30-second TTL
   (configurable), per the clipboard-exposure mitigation.
3. Given an empty vault, when the list screen loads, then an empty-state UI explains how to add
   the first secret (links to MSM-7).
4. Given a corrupted/undecryptable item envelope, when opened, then the UI shows an explicit error
   rather than silently showing blank or garbage content.
**Dependencies**: MSM-5. **Non-functional**: security — no secret value rendered in logs/screenshots
API (e.g., mark screens as secure/no-screenshot where the OS supports it); accessibility — list and
detail views are screen-reader navigable.
**Out of scope**: sync with other devices (MSM-14); this story is local single-device storage only.

### MSM-7 — Mobile create/edit/delete a secret (local-only)
**Disciplines**: frontend, mobile.
**Outcome**: As a user, I can add, edit, and delete secret items in my local vault.
**Acceptance criteria**:
1. Given the create-item form, when required fields are missing (e.g., no title), then submission
   is blocked with a field-level validation error.
2. Given a new item is saved, when saved, then it is encrypted via MSM-2 before any disk write and
   appears in the list (MSM-6) with an incremented local revision.
3. Given an existing item is edited, when saved, then its revision counter increments and the prior
   plaintext is not retrievable from disk (ciphertext-only persistence, re-verified per MSM-3
   criterion 4).
4. Given a delete action, when confirmed, then the item is removed from the visible list; soft
   deletion/tombstone semantics for sync are deferred to MSM-13/14 (local delete now is a hard
   delete of the local cache row).
**Dependencies**: MSM-6. **Non-functional**: none beyond MSM-2/MSM-3 security carryover.
**Out of scope**: cross-device delete propagation (requires MSM-13 tombstones).

### MSM-8 — Recovery Kit generation and display at onboarding
**Disciplines**: frontend, mobile.
**Outcome**: As a new user, I receive a one-time Recovery Kit at vault creation so I can regain
access if I forget my master password.
**Acceptance criteria**:
1. Given vault creation completes (MSM-4), when the Recovery Kit step is reached, then a
   high-entropy recovery key is generated client-side and independently wraps the DEK (separate
   from the master-password wrapping).
2. Given the Recovery Kit is displayed, when shown, then the UI requires an explicit user
   acknowledgment ("I have saved this") before proceeding, and the raw key is never transmitted to
   or stored by the backend.
3. Given the user dismisses the screen without acknowledging, when they attempt to proceed, then
   the UI blocks progression and re-prompts (cannot be silently skipped).
4. Given this flow is distinct from "reset your account password," when either flow's copy is
   shown, then the Recovery Kit flow's language explicitly says "recover your vault" to avoid
   confusing the two reset paths (per design-handoff §2.1 reconciliation).
**Dependencies**: MSM-4. **Non-functional**: security — recovery key displayed once, not retrievable
again after dismissal (no "view again" of the raw key unless regenerated, which invalidates the
old one).
**Out of scope**: printable/PDF export formatting (nice-to-have, not MVP-blocking).

### MSM-9 — Vault recovery via Recovery Kit (lost master password)
**Disciplines**: frontend, mobile.
**Outcome**: As a user who forgot my master password, I can use my Recovery Kit to regain access to
my vault and set a new master password.
**Acceptance criteria**:
1. Given a user selects "recover your vault" (distinct entry point from account-password reset),
   when they enter their Recovery Kit key, then the app unwraps the DEK using it, independent of
   the (forgotten) master password.
2. Given a successful Recovery Kit unwrap, when it succeeds, then the user is prompted to set a new
   master password, which re-wraps the DEK under the new password.
3. Given an incorrect Recovery Kit key, when entered, then the UI shows a generic failure without
   revealing whether the account exists.
4. Given this is a new flow (not covered by MSM-4's first-time-use step), when implemented, then it
   is reachable from the unlock screen (MSM-5) as a clearly separate action from "forgot account
   password."
**Dependencies**: MSM-8. **Non-functional**: security — same as MSM-8; rate-limit recovery attempts
once backend auth exists (ties to MSM-10).
**Out of scope**: recovering a vault with no Recovery Kit saved (explicitly unrecoverable by design).

### MSM-10 — Backend account registration, login, session
**Disciplines**: backend. Frontend/mobile: consume via API only (covered in MSM-4/5 UI stories).
**Outcome**: As a user, I can register and log in to an account that authenticates API calls,
independent of my vault's master password.
**Acceptance criteria**:
1. Given a new registration request, when processed, then the backend stores only a salted/hashed
   account credential (e.g., Argon2id/bcrypt), never the master password or derived vault key.
2. Given valid login credentials, when authenticated, then the backend issues a short-lived access
   token and a refresh token; access tokens are rejected once expired.
3. Given an authenticated request, when any sync endpoint is called, then the backend derives
   `owner_id` from the authenticated principal and never trusts a client-supplied owner/account ID.
4. Given invalid credentials, when login is attempted, then the backend returns a generic
   authentication-failure response (no user-enumeration signal).
**Dependencies**: MSM-1. **Non-functional**: security — token rotation policy documented; passwords
hashed with a memory-hard algorithm; observability — auth failures are logged without credentials
(ties to MSM-19).
**Out of scope**: SSO/OAuth providers; this covers only the account-auth mechanism, not vault
unlock (which is purely client-side, MSM-2).

### MSM-11 — Backend vault bootstrap endpoint (KDF params issuance)
**Disciplines**: backend.
**Outcome**: As a client, I can fetch the KDF salt and parameters needed to re-derive my vault key
on a new device, without the backend ever learning the master password.
**Acceptance criteria**:
1. Given an authenticated user, when they call the bootstrap endpoint (e.g. `GET /v1/vault/kdf`),
   then the response contains `{ saltRef, salt, kdfParams }` scoped to that account only.
2. Given the endpoint is called, when processed, then the backend never receives or logs the master
   password or any derived key.
3. Given a user has not yet created a vault, when the endpoint is called, then it returns a clear
   "not yet provisioned" response rather than an error that implies a system fault.
4. Given KDF parameters may evolve, when a client requests bootstrap data, then the response
   includes the parameter version used so future unlocks remain compatible with older vaults.
**Dependencies**: MSM-10. **Non-functional**: security — endpoint reachable only pre-unlock (no
vault data exposed); rate-limited to reduce brute-force probing.
**Out of scope**: KDF parameter rotation/migration tooling (future work).

### MSM-12 — Backend sync API: item upsert/read with revision concurrency
**Disciplines**: backend.
**Outcome**: As a client, I can read and write my encrypted items with optimistic concurrency so
concurrent edits across devices are never silently overwritten.
**Acceptance criteria**:
1. Given an item write request, when the submitted revision does not match the stored revision,
   then the backend returns `409 version_conflict` with both the client's and server's current
   envelope, and does not apply the write.
2. Given a matching revision, when the write is applied, then the stored revision increments
   monotonically and the response includes the new revision.
3. Given a read request for an item that was previously tombstoned, when the direct item lookup is
   made, then the backend returns `410 Gone`.
4. Given any upsert request body, when it includes an `ownerId` field, then the backend ignores or
   rejects it and uses only the authenticated principal's owner ID (no client-controlled
   ownership).
5. Given the stored schema, when inspected, then it contains only an opaque ciphertext blob plus
   non-secret metadata (`item_id, owner_id, revision, created_at, updated_at, deleted_at,
   change_seq`) — no field that could hold plaintext or envelope context beyond what MSM-2 defines.
**Dependencies**: MSM-11. **Non-functional**: security — schema review confirms no accidental
plaintext field; performance — upsert/read endpoints respond within a defined budget under expected
single-user load (to be set once load expectations exist).
**Out of scope**: real-time push notifications of changes (polling/pull-on-open only for MVP).

### MSM-13 — Backend sync API: change feed, cursor pagination, tombstones
**Disciplines**: backend.
**Outcome**: As a client, I can fetch only what changed since my last sync, including deletions, so
multi-device sync stays efficient and consistent.
**Acceptance criteria**:
1. Given a cursor from a prior sync, when `GET /v1/items?cursor=...` is called, then the response
   contains only items changed after that cursor, including tombstoned (deleted) items.
2. Given a delete occurs, when the next change-feed page is fetched, then the deleted item appears
   as a tombstone rather than being silently omitted.
3. Given an expired/invalid cursor, when supplied, then the backend signals that a full resync
   (including tombstones) is required, rather than silently returning a partial or empty page.
4. Given pagination, when a client advances `nextCursor`, then it advances only through changes
   included in that specific page (no gap or duplicate skipping of deletions).
**Dependencies**: MSM-12. **Non-functional**: test coverage — a test plan verifies multi-page sync
correctly surfaces every create/update/delete at least once across page boundaries.
**Out of scope**: real-time push sync (explicitly deferred; polling only for MVP).

### MSM-14 — Mobile sync integration: enable sync, offline queue, pending indicator
**Disciplines**: frontend, mobile.
**Outcome**: As a user, my secrets sync across my own devices, and I can keep working offline with
a clear indicator of what hasn't synced yet.
**Acceptance criteria**:
1. Given the device is offline, when a user creates/edits/deletes a secret, then the change is
   queued locally and the UI shows a pending-sync badge on that item.
2. Given connectivity returns, when the app resumes, then queued changes are pushed via MSM-12/13
   and the pending-sync badge clears once the server confirms the new revision.
3. Given a second device has newer data, when sync runs, then the device applies the change feed
   (including tombstones) and updates its local list/view accordingly.
4. Given a local item was deleted on this device while another device edited it concurrently, when
   sync reconciles, then the conflict is surfaced per MSM-15 rather than silently resolved.
**Dependencies**: MSM-7, MSM-13. **Non-functional**: a test plan verifies offline/pending-sync
parity on both of the targeted platforms (per the handoff doc's fitness-function recommendation).
**Out of scope**: background/push-triggered sync (pull-on-open/foreground sync only for MVP).

### MSM-15 — Conflict resolution UI (409 version_conflict, side-by-side)
**Disciplines**: frontend, mobile.
**Outcome**: As a user, when the same secret was edited on two devices, I can see both versions and
choose how to resolve it, instead of silently losing data.
**Acceptance criteria**:
1. Given a `409 version_conflict` response (MSM-12), when received, then the UI shows both the
   local (losing) and server (current) versions side by side.
2. Given the conflict screen, when the user picks a version, then that version is saved with a new
   revision and the other is discarded only after explicit user choice (no automatic
   last-write-wins).
3. Given the user dismisses the conflict screen without choosing, when they return to the item
   later, then the conflict is still pending and surfaced again (not silently dropped).
**Dependencies**: MSM-14. **Non-functional**: accessibility — both versions are distinguishable
without relying on color alone.
**Out of scope**: automatic field-level merge (explicitly out of scope per ADR-0003: "surfacing,
not general CRDT merge logic in v1").

### MSM-16 — CI pipeline: lint/build/test for backend and mobile
**Disciplines**: infrastructure.
**Outcome**: As a contributor, every change is automatically linted, built, and tested so
regressions are caught before merge.
**Acceptance criteria**:
1. Given a pull request touching backend code, when CI runs, then it lints, builds, and runs the
   backend test suite, and fails the check on any failure.
2. Given a pull request touching mobile/shared-core code, when CI runs, then it lints, builds, and
   runs unit tests for the shared core and mobile app, failing the check on any failure.
3. Given CI passes, when merged, then the pipeline produces a reusable build artifact (backend
   image/package; mobile build) consumable by MSM-17/MSM-18.
**Dependencies**: MSM-1. **Non-functional**: CI run time budget should be defined once the codebase
exists (flag as follow-up, not blocking this story's closure).
**Out of scope**: production deployment automation (MSM-17).

### MSM-17 — Backend hosting: staging + production environments, config/secrets
**Disciplines**: infrastructure.
**Outcome**: As the team, we have a staging and a production environment for the backend so changes
can be validated before real users depend on them.
**Acceptance criteria**:
1. Given a CI artifact (MSM-16), when deployed to staging, then the backend runs with its own
   database and environment-scoped configuration, isolated from production.
2. Given secrets/config (DB credentials, token signing keys), when provisioned, then they are
   stored in a secrets mechanism, never committed to the repository.
3. Given a deployment to production, when performed, then it requires an explicit, auditable
   approval step distinct from merging to the main branch.
4. Given a bad deploy, when identified, then a documented rollback path (e.g., redeploy previous
   artifact) exists and is tested at least once.
**Dependencies**: MSM-10. **Non-functional**: availability — document the accepted MVP
availability target (single-instance is acceptable per ADR-0003's "no HA requirement for v1");
security — least-privilege access to production secrets.
**Out of scope**: multi-region or high-availability infrastructure (explicitly deferred per
ADR-0003 revisit triggers).

### MSM-18 — Mobile internal-distribution build pipeline (signing, test track)
**Disciplines**: infrastructure, mobile.
**Outcome**: As the team, we can distribute signed mobile builds to internal testers without a
manual, ad-hoc process.
**Acceptance criteria**:
1. Given a CI build (MSM-16), when a release build is produced, then it is signed using managed
   (not manually shared) signing credentials.
2. Given a signed build, when published, then it reaches an internal test track (e.g., TestFlight
   internal / Play internal testing) reachable by the team without a public store listing.
3. Given a build fails signing or packaging, when CI runs, then the pipeline fails clearly rather
   than silently skipping distribution.
**Dependencies**: MSM-16, MSM-5. **Non-functional**: security — signing keys stored in a secrets
mechanism, not in source control.
**Out of scope**: public app-store submission/review (explicitly out of scope for this MVP's exit
criteria; a follow-up story once the team decides to go public).

### MSM-19 — Backend observability: ciphertext-safe logging, metrics, alerting
**Disciplines**: infrastructure, backend.
**Outcome**: As the team operating the backend, we have logs/metrics/alerts that let us detect and
diagnose incidents without ever exposing secret plaintext or master-key material.
**Acceptance criteria**:
1. Given any backend request/response logging, when inspected, then no field matching a known
   plaintext secret pattern, master password, or derived key ever appears in logs (fitness
   function: an automated check scans log output for such patterns).
2. Given sync/auth endpoints, when operating normally, then basic metrics (request rate, error
   rate, latency) are emitted and visible on a dashboard.
3. Given an elevated error rate or outage, when it occurs, then an alert fires to the team within a
   defined, documented time budget.
4. Given account metadata (timestamps, item counts, sync frequency) is logged for operability, when
   reviewed, then this is explicitly documented as an accepted, minimal metadata-leakage tradeoff
   (per ADR-0001/0003 risk notes), not an oversight.
**Dependencies**: MSM-17. **Non-functional**: privacy — metadata logging is the minimum needed for
operability; no plaintext-adjacent fields retained beyond what's documented.
**Out of scope**: formal compliance/audit-log export features (explicitly unresolved/out of scope
per existing research; revisit if compliance requirements are introduced).

## Sequencing and Release Increments

1. **Increment 0 — Unblock (MSM-1)**: architecture ratification. No other story starts until this
   closes; treat as the smallest possible "increment" (a decision record, not shippable software).
2. **Increment 1 — Local-only mobile vertical slice (MSM-2 → MSM-9)**: a fully usable, single-device
   mobile vault (create, unlock, view/copy, CRUD, Recovery Kit) with no backend dependency. This is
   independently demoable and de-risks the crypto/storage contract before any sync complexity, per
   the existing design docs' explicit build-order guidance ("build shared core and its test suite
   before any UI work" / "mobile crypto core + UI first... then relay sync").
3. **Increment 2 — Backend + sync (MSM-10 → MSM-15)**: introduces the account service, vault
   bootstrap, and sync API, then wires the mobile client to it with offline queueing and conflict
   UI. Feature-flag sync so Increment 1's local-only mode keeps working if sync is disabled
   (rollback path).
4. **Increment 3 — Deployment (MSM-16 → MSM-19)**: CI should actually start as early as MSM-2 in
   practice (don't wait for Increment 3 to add lint/test gating), but staging/production hosting
   (MSM-17), release-track distribution (MSM-18), and observability (MSM-19) depend on the backend
   existing (MSM-10) and are sequenced last here because they gate the "fully working MVP"
   exit criteria, not initial development.
5. **Smallest releasable increment for "fully working MVP"**: MSM-1 through MSM-19 as listed is the
   full MVP; if an earlier releasable slice is wanted, Increment 1 alone (local-only, no sync) is
   shippable as an internal alpha, with Increment 2+3 required before any claim of a
   "fully working, multi-device" MVP.
6. **Migrations/feature flags**: sync is the only feature proposed behind a flag (local-only mode
   is the safe fallback). No data migration exists yet (greenfield).

## Risks, Assumptions, Open Questions

- **[Blocking] Architecture conflict (MSM-1)**: two contradictory, both-merged `ADR-0001`s
  (Flutter vs. React Native) must be reconciled before coding stories start. This plan assumes
  Lineage A's technical details as a placeholder baseline only.
- **[Assumption] MVP boundary**: no prior MVP-scope decision existed in the repo; this plan assumes
  "mobile app + backend sync, web deferred" as the MVP boundary. MSM-1 should confirm or correct
  this.
- **[Risk] Clipboard exposure**: auto-clear TTL (MSM-6) is a documented, accepted residual risk on
  some platforms; no action needed beyond what's specified unless a stricter requirement emerges.
- **[Open question] Compliance/audit/export requirements**: unresolved in all prior research and
  design docs; currently out of scope. Needs an explicit decision if enterprise/compliance use
  cases are introduced later.
- **[Open question] Multi-device revocation UI** ("log out other sessions"): flagged by the
  existing design-handoff doc as needed before any post-MVP multi-device session-management work;
  not required for this MVP's definition but should be scheduled before scaling up concurrent
  device usage.
- **[Risk] KDF performance**: Argon2id may be slow/unavailable on constrained runtimes; MSM-2
  already specifies a PBKDF2-SHA256 fallback, but actual performance budgets are unset until
  real-device testing occurs (flagged under MSM-5 NFRs).
- **[Assumption] Single environment team**: MSM-17's "no HA requirement for v1" assumption follows
  ADR-0003; revisit if usage or stakes grow per that ADR's revisit triggers.
