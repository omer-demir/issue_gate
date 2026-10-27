# Technical reference

This is the implementation reference for client encryption and synchronization. The [architecture guide](mobile-secret-manager-architecture.md) explains boundaries and limitations; the [backend API reference](../../backend/README.md#api) is the single documentation source for endpoint paths and request/response shapes. Earlier proposed endpoints such as `/v1/vault/bootstrap` and `/v1/vault/{vaultId}/items` are not implemented.

## Cryptography

The two implementations are [`web/src/lib/crypto.ts`](../../web/src/lib/crypto.ts) and [`mobile/lib/src/core/crypto/crypto_core.dart`](../../mobile/lib/src/core/crypto/crypto_core.dart). They use Web Crypto and Dart's `cryptography` package respectively.

| Property | Current format |
|---|---|
| Master/recovery wrapping-key derivation | PBKDF2-HMAC-SHA256, 310,000 default iterations, 256-bit output |
| KDF identifier/version | `PBKDF2-SHA256`, `kdfParamsVersion: 1` |
| Salt | 16 random bytes, base64-encoded; separate master and recovery salts |
| Vault key | Random 256-bit AES data encryption key (DEK) |
| Item cipher | AES-256-GCM, `algo: "AES-256-GCM"`, default `schemaVersion: 1` |
| Nonce | Fresh 12-byte random value for each encryption/wrap |
| Ciphertext encoding | Ciphertext concatenated with the 16-byte authentication tag, then base64-encoded; nonce stored separately |
| Plaintext serialization | UTF-8 JSON |
| Wrapped DEK | AES-GCM encryption of raw DEK bytes; `{ wrapped, nonce }`, both base64 |

Master-password derivation uses the stored iteration count. Recovery wrapping uses the fixed recovery derivation settings in each crypto module. KDF or recovery-format changes therefore require an explicit compatibility/migration design, not just a new default constant.

Wrong-key or modified-ciphertext authentication failures reject decryption rather than yielding usable plaintext. Argon2id is a planned alternative, not the shipped KDF. The current encryption calls do **not** supply AEAD associated data binding owner/item/algorithm/schema fields, despite that requirement in earlier ADRs. API ownership checks and AEAD item-context binding are different protections; do not describe one as satisfying the other.

Matching algorithm choices do not prove cross-platform interoperability. Both platforms have their own unit tests, but the shared deterministic Dart/TypeScript vectors specified by ADR-0005 are not implemented. Recovery-key text generation/handling and serialized payload compatibility also need cross-platform coverage.

## Cross-device vault key sync

The KDF endpoint stores only bootstrap metadata. Clients use a reserved item to sync the two encrypted DEK wraps:

- `itemId`: `__vault_meta__`
- `algo`: `vault-meta-v1`
- `ciphertext`: base64-encoded JSON containing the fields below

```text
{
  masterSalt,
  kdfParams,
  wrappedDekByMaster: { wrapped, nonce },
  recoverySalt,
  wrappedDekByRecovery: { wrapped, nonce }
}
```

The outer metadata JSON is encoded, **not encrypted**. Its DEK values are encrypted wraps, and its salts/KDF parameters are non-secret. The recovery key and master password are not part of this payload. The API stores it opaquely using the regular item routes, so it has the same revision/conflict behavior as other items. Clients exclude it from ordinary secret lists and must not attempt to decrypt it as a normal AES-GCM item.

See [`web/src/lib/types.ts`](../../web/src/lib/types.ts) and [`mobile/lib/src/core/api/models.dart`](../../mobile/lib/src/core/api/models.dart) for current payload models. Changes must preserve both implementations and existing vaults.

## Data flows

### Setup

1. Register/login with an account password to obtain API tokens.
2. Generate a DEK and master/recovery salts locally; derive wrapping keys and produce both DEK wraps.
3. Provision `/v1/vault/kdf` and write the reserved metadata item separately.
4. Display the Recovery Kit and require the user's saved-kit acknowledgment before entering the vault.

Bootstrap and metadata upload are separate requests, not a transaction. A failed intermediate request can leave a provisioned KDF record without complete metadata; atomic setup/recovery from partial provisioning remains a concern for further work.

### Unlock and recovery

After account authentication, the client checks KDF bootstrap and fetches the metadata item. The master password derives a key that unwraps the DEK locally. Recovery instead derives a wrapping key from the Recovery Kit, unwraps the same DEK, and updates its master-password wrap using a new password. Secret items do not need re-encryption when the same DEK is retained.

Recovery still needs access to the account and its stored ciphertext/metadata. It does not restore data erased by a backend restart, and it is not an account-password reset endpoint.

### Item changes and conflicts

The client encrypts JSON locally and sends the envelope with `expectedRevision`. The API derives ownership from the token and checks the expected revision before storing the change. A stale write returns `409 version_conflict` with the server envelope; the client can display both versions rather than silently replacing the server copy.

Use the [API guide](../../backend/README.md#items-and-change-feed) for pagination, tombstones, and exact error bodies. The feed contains latest item states, not a version-history archive. The server does not retain both versions of a rejected write for later merging.

### Offline behavior

Client providers/repositories retain local items and pending operations in memory. Reconnect can trigger another sync attempt, but pending work does not survive tab reload or app process death. Initial account authentication, vault bootstrap, and metadata fetches require the API. Persistent offline reads/writes envisioned in earlier design documents are not implemented.

## Changing contracts safely

API record types live in [`backend/src/types.ts`](../../backend/src/types.ts); route behavior lives in `backend/src/routes/`. Web and mobile mirror those definitions manually. There is no generated OpenAPI or shared model package to update automatically.

For an API change, update backend validation/response types, both clients' models and HTTP methods, relevant tests, and the backend guide together. Keep additive changes compatible with older clients; incompatible behavior needs explicit versioning and migration rather than silently reusing `/v1`.

For a crypto change, preserve decryption of existing ciphertext and wraps, version the format, and provide deterministic vectors consumed by both client test suites. Cover wrong keys, tampering, wrapping, recovery, and cross-platform serialization. Never perform vault decryption or key migration on the server.

## Verification boundaries

Backend tests exercise auth, ownership, revisions, and feed behavior against the in-memory store. Client crypto tests exercise their own implementations. These do not verify a persistent database, cross-language compatibility, secure hardware, native links, or end-to-end multi-device recovery.

The stronger validation goals in the ADRs remain requirements for future work, not results of this documentation. See the [mobile guide](../../mobile/README.md#limitations-and-device-review) for native checks and [operations](../ops/docker-and-vps.md) for deployment blockers.
