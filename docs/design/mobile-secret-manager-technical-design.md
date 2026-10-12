# Technical Design: Mobile + Web Secret Manager

Companion document to [ADR-0001](../adr/0001-mobile-web-secret-manager-architecture.md).
Read the ADR first for the decision rationale; this document specifies the
resulting boundaries, interfaces, and data flows precisely enough for planning
and implementation.

## 1. System Boundaries

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│   Flutter Client (shared)    │     │   Flutter Client (shared)    │
│   target: iOS / Android      │     │   target: Web                │
│                              │     │                              │
│  UI ─ ViewModel ─ CryptoCore │     │  UI ─ ViewModel ─ CryptoCore │
│         │                   │     │         │                   │
│   SecretStore (Keychain/     │     │   SecretStore (IndexedDB,   │
│   Keystore-backed)           │     │   ciphertext only)           │
│         │                   │     │         │                   │
│   SyncClient (HTTPS/JSON)    │     │   SyncClient (HTTPS/JSON)    │
└──────────────┬───────────────┘     └──────────────┬───────────────┘
               │                                    │
               └───────────────┬────────────────────┘
                                ▼
                  ┌───────────────────────────┐
                  │   Thin Ciphertext Relay    │
                  │   (sync + auth only)       │
                  │                            │
                  │  AuthService  │ SyncService │
                  └──────────────┬─────────────┘
                                 ▼
                       ┌──────────────────┐
                       │   Datastore       │
                       │ (ciphertext blobs │
                       │  + metadata only) │
                       └──────────────────┘
```

**Trust boundary**: everything left of (and including) `CryptoCore` holds
plaintext secrets and key material, in memory only, on the user's own device.
Everything at or beyond `SyncClient` — the network, the relay, and the
datastore — only ever sees ciphertext plus non-sensitive metadata. This is the
load-bearing boundary of the zero-knowledge model; no component on the server
side is permitted to decrypt secret values, by design (not just by policy).

## 2. Data Ownership

| Data | Owner | Where stored | Format |
|---|---|---|---|
| Master password | User (never transmitted or stored anywhere) | Nowhere persistent; entered each unlock | N/A |
| Master key, DEK | Client, in-memory only during a session | RAM only (mobile may wrap a re-unlock convenience key in OS keystore, never the raw DEK) | Raw key bytes |
| Secret item plaintext (title, username, password, URL, notes) | Client | RAM during use; ciphertext form in local `SecretStore` | Decrypted Dart objects, never logged |
| Secret item ciphertext | Client authoritative copy; relay holds a replica for sync | Local `SecretStore` (Keychain/Keystore/IndexedDB) + relay `Datastore` | AES-256-GCM blob (nonce + ciphertext + tag) |
| Item metadata (id, category, timestamps, version) | Relay is the sync source of truth; client mirrors it | Relay `Datastore` + local `SecretStore` | Plaintext JSON (non-sensitive) |
| Account auth credential | Relay (`AuthService`) | Relay `Datastore`, Argon2id-hashed | Hash + salt + KDF params |
| Recovery Kit (wrapped DEK under a recovery key) | User (exported, user-stored, e.g. printed/saved externally) | Not stored by the relay by default (optional opt-in encrypted backup only) | Encrypted blob + recovery phrase |

## 3. Core Interfaces

### 3.1 `CryptoCore` (Dart, shared by all targets)

```dart
abstract class CryptoCore {
  /// Derives the master key from the user's master password and the
  /// per-vault KDF salt/params. Pure function of (password, salt, params);
  /// never persisted.
  Future<MasterKey> deriveMasterKey(
    String masterPassword,
    KdfParams params,
  );

  /// Unwraps the vault's Data Encryption Key using the master key.
  /// Throws [CryptoException] on auth-tag mismatch (wrong password or
  /// tampered wrap) — never returns a "best effort" partial result.
  Future<DataEncryptionKey> unwrapVaultKey(
    MasterKey masterKey,
    WrappedKey wrappedDek,
  );

  /// Encrypts a single secret item's plaintext fields with the DEK.
  /// Each call uses a fresh random nonce.
  CipherText encryptItem(DataEncryptionKey dek, SecretItemPlain item);

  /// Decrypts a secret item. Throws [CryptoException] on tag mismatch;
  /// callers must treat this as "cannot display this item" and surface it
  /// to the user, never silently skip or show garbage.
  SecretItemPlain decryptItem(DataEncryptionKey dek, CipherText blob);

  /// Produces a Recovery Kit: a random recovery key that independently
  /// wraps the same DEK, for the user to store out-of-band.
  RecoveryKit generateRecoveryKit(DataEncryptionKey dek);
}
```

**Invariants**
- `CryptoCore` never performs network or disk I/O; it is pure
  cryptography, independently unit-testable, and identical across all three
  client targets (mobile, web).
- Any decrypt failure is a hard error, not a fallback-to-plaintext or
  fallback-to-empty-string path.
- KDF parameters (algorithm, memory/iterations, salt) are stored alongside
  the wrapped DEK so a future client build can always reproduce the same
  derivation for a given vault.

### 3.2 `SecretStore` (platform-specific implementation, shared interface)

```dart
abstract class SecretStore {
  /// Persists an encrypted item locally. Implementations must never accept
  /// plaintext — this is enforced by the type system (CipherText only).
  Future<void> putItem(String itemId, CipherText blob, ItemMetadata meta);

  Future<CipherText?> getItem(String itemId);

  Future<List<ItemMetadata>> listMetadata({String? categoryFilter});

  Future<void> deleteItem(String itemId);

  /// Returns items changed since [sinceVersion], for sync upload.
  Future<List<PendingChange>> pendingChangesSince(int sinceVersion);
}
```

Implementations:
- **Mobile**: backed by `flutter_secure_storage` (iOS Keychain / Android
  Keystore) for the wrapped DEK and any biometric re-unlock token; bulk item
  ciphertext may live in a local encrypted SQLite file (e.g. SQLCipher) keyed
  indirectly by the DEK, since OS keystores are not designed for bulk blob
  storage.
- **Web**: backed by IndexedDB, ciphertext only. No keystore equivalent exists;
  this is the documented limitation from ADR-0001 Risks.

### 3.3 `SyncClient` (HTTPS/JSON contract with the relay)

All endpoints are plain HTTPS/JSON. Auth uses a short-lived bearer token
(issued at login, refreshed via refresh token) — standard session auth,
**entirely separate from the vault master key**.

```
POST /v1/auth/register
  body: { email, authVerifier, kdfParams }      // authVerifier = Argon2id(masterPassword-derived? NO:
                                                 // a separate account-login secret, distinct from master password,
                                                 // per ADR-0001 "independent from vault master key"
  -> 201 { accountId }
  -> 409 { error: "email_taken" }

POST /v1/auth/login
  body: { email, authVerifier }
  -> 200 { accessToken, refreshToken, expiresIn }
  -> 401 { error: "invalid_credentials" }

POST /v1/vault/bootstrap           // first-time vault creation
  auth: Bearer accessToken
  body: { wrappedDek, kdfParams }
  -> 201 { vaultId }
  -> 409 { error: "vault_already_exists" }

GET  /v1/vault/{vaultId}/items?sinceVersion={n}
  auth: Bearer accessToken
  -> 200 { items: [ { itemId, cipherText, nonce, tag, category, version, updatedAt } ],
           serverVersion }
  -> 404 { error: "vault_not_found" }

PUT  /v1/vault/{vaultId}/items/{itemId}
  auth: Bearer accessToken
  body: { cipherText, nonce, tag, category, baseVersion }
  -> 200 { version, updatedAt }                       // accepted
  -> 409 { error: "version_conflict", serverItem: {...} }  // caller must
                                                            // resolve, see 3.4
  -> 413 { error: "payload_too_large" }   // item ciphertext size cap, e.g. 64 KiB

DELETE /v1/vault/{vaultId}/items/{itemId}
  auth: Bearer accessToken
  -> 204
  -> 404 { error: "item_not_found" }
```

**Versioning / compatibility rules**
- API is versioned by URL path segment (`/v1/...`). Breaking changes require a
  new path segment (`/v2/...`); the relay supports at most two versions
  concurrently during a migration window.
- `kdfParams` and the wrap format are self-describing (include an algorithm
  identifier), so older clients can refuse unsupported formats gracefully
  instead of misinterpreting them.
- Adding new optional fields to item metadata (e.g., a future `favorite` flag)
  is additive and must not break clients that ignore unknown fields.

**Error semantics**
- All error responses use a consistent `{ error: <machine_code>, message }`
  envelope. Machine codes are stable and documented; UI never parses the
  human `message`.
- `409 version_conflict` is not retried blindly by the client; it is surfaced
  to the user with both versions, per ADR-0001's conflict-handling decision.
- Network/timeout errors leave local `SecretStore` as the source of truth;
  the UI continues to function offline, with a "last synced at" indicator.

### 3.4 Conflict Resolution Flow

1. Client holds `baseVersion` = the version it last synced for an item.
2. On `PUT`, if the relay's current version for that item differs from
   `baseVersion`, it is a conflict: relay rejects with `409` and returns its
   current server copy.
3. Client decrypts both the local pending edit and the server's version,
   presents both to the user ("This item was changed elsewhere. Keep mine /
   keep theirs / keep both as separate items").
4. No automatic merge of secret field contents is attempted — merging
   encrypted credential data automatically is unsafe and out of scope.

## 4. Data Flows

### 4.1 Create/Update a secret (happy path, online)
`UI -> ViewModel -> CryptoCore.encryptItem(DEK, plaintext) -> SecretStore.putItem
(local ciphertext write) -> SyncClient.putItem (network) -> relay validates
version, persists ciphertext+metadata -> ack with new version -> SecretStore
updates local version stamp.`

### 4.2 View/copy a secret
`UI -> SecretStore.getItem -> CryptoCore.decryptItem(DEK, blob) -> plaintext
held in memory only for display -> on "copy" action, OS clipboard API invoked
with a TTL-based auto-clear scheduled (see ADR-0001 Risks) -> plaintext never
written to any log, crash report, or analytics event (explicit code-review
gate, see Validation).`

### 4.3 First unlock on a new device
`User enters email+login secret -> AuthService issues accessToken -> client
fetches wrappedDek + kdfParams via GET /v1/vault/{id} -> user enters master
password -> CryptoCore.deriveMasterKey -> CryptoCore.unwrapVaultKey -> on
success, pull all items via GET .../items?sinceVersion=0 -> decrypt and
populate local SecretStore.`

### 4.4 Offline edit then reconnect
`Edits are written to local SecretStore immediately (optimistic UI, no network
required) and queued as PendingChange entries -> on reconnect, SyncClient
drains the pending-change queue in order, handling 409s per §3.4 -> UI
reflects "syncing.../synced" status.`

## 5. Quality Attributes Summary

| Attribute | Target | How achieved |
|---|---|---|
| Confidentiality | Relay/server never sees plaintext or usable key material | Zero-knowledge architecture (ADR-0001 §3); ciphertext-only datastore |
| Availability (mobile) | Fully functional offline for view/create/update | Local `SecretStore` is authoritative for UI; sync is async and best-effort |
| Integrity | Tampered ciphertext must never be silently accepted as valid plaintext | AES-GCM auth tag verified on every decrypt; hard failure on mismatch |
| Consistency | No silent data loss on concurrent edits | Explicit version-conflict surfacing (§3.4), never auto-merge |
| Portability | One behavior across iOS/Android/Web | Shared Dart `CryptoCore` + `ViewModel`; only `SecretStore`/platform storage differs |
| Recoverability | Losing the master password should not be an unrecoverable dead end if the user followed setup | Recovery Kit issued at vault creation (§2, §3.1) |

## 6. Open Questions (carried from design-context, not yet resolved)

1. **Account-login secret vs. master password**: this design assumes they are
   two distinct secrets (recommended best practice) rather than one. If the
   user explicitly wants single-secret convenience, the account-login secret
   can instead be derived from the master password via a second, independent
   KDF salt — but this reduces recoverability (the account becomes unlockable
   only through the master password, with no separate "forgot password"
   path for login). **Needs a decision from the user/product owner before
   Phase 2 implementation.**
2. **Multi-device limit and revocation**: no device-management/"log out other
   sessions" UI is specified yet; recommend adding before any sync.
3. **Backup/export format**: whether the user wants an encrypted export file
   (e.g., for migrating off the service entirely) — not yet specified.
4. **Sharing/teams**: explicitly out of scope for v1 per ADR-0001; confirm this
   matches actual need before committing to the single-tenant key model.
5. **Hosting of the thin relay**: ADR-0001 deliberately leaves the concrete
   hosting choice (self-managed VM vs. managed platform) open, since it does
   not affect the client contract; should be decided at implementation
   planning time based on actual cost/ops preference.

## 7. Handoff Notes for Planning / Implementation Agents

- Build order should follow the phased rollout in ADR-0001 §Migration: Phase 1
  (local-only crypto core + mobile UI) is independently shippable and testable
  before any backend exists — start there.
- `CryptoCore` and `SecretStore`/`SyncClient` interfaces above are the contracts
  implementation agents should code against; treat them as the seam for unit
  vs. integration testing.
- Resolve Open Question 1 (account-login vs. master password separation)
  before writing the `AuthService`/`POST /v1/auth/register` implementation,
  since it changes the request schema.
- No infrastructure or vendor has been chosen for the relay hosting — that is
  an implementation-planning decision, not an architecture one, per ADR-0001.
