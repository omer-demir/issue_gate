# ADR-0001: Client-Side Zero-Knowledge Encryption for Stored Secrets

Status: Proposed

## Context

The product stores passwords and login credentials ("secrets") that must be
readable natively on mobile and web, implying some form of multi-device sync
through a shared backend component. The repository is currently greenfield
(only `README.md` exists; no prior architecture, crypto, or storage code to
extend — verified via `list_files`/`search_text`/`git log`).

Drivers:
- **Security**: secrets are high-value targets; a server compromise, insider
  threat, subpoena, or misconfigured access control must not expose plaintext
  credentials.
- **Trust boundary**: any sync backend is a shared, internet-reachable
  component and therefore a larger attack surface than a single local device.
- **User expectation**: the request explicitly asks for protection "like other
  secure services," which in this domain (Bitwarden, 1Password, KeePass)
  conventionally means the server never sees plaintext.
- **Constraint**: no compliance regime (e.g., SOC2) is stated yet, but
  credential data is inherently sensitive regardless of formal scope.

Open question carried from research: should the server ever see plaintext?
This ADR resolves that question because it is a hard prerequisite for every
downstream interface (sync API, backend storage schema, mobile/web clients).

## Decision

Adopt a **client-side, zero-knowledge encryption** model:

- All secret values (and sensitive metadata such as usernames/notes) are
  encrypted **on the client** before leaving the device, using a per-user
  master key derived from a master password/passphrase.
- The sync backend stores and transmits only **opaque encrypted blobs** plus
  non-sensitive indexing metadata needed for sync (item ID, revision, updated
  timestamp, owner ID). It never has access to the plaintext or to the master
  key.
- Key derivation uses a memory-hard KDF (Argon2id) with a per-user random
  salt generated at enrollment; the derived master key never leaves the
  device.
- Item-level encryption uses an authenticated cipher (XChaCha20-Poly1305 or
  AES-256-GCM) via a vetted cryptography library — no custom cryptographic
  primitives are implemented in-house.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Server-side encryption at rest (backend holds/derives keys) | Server compromise or malicious insider directly exposes plaintext; contradicts "secure like other secure services" expectation and the zero-knowledge risk flagged in research. |
| No encryption, rely solely on transport (TLS) + backend access control | Leaves plaintext at rest on the backend and in backups; single misconfiguration (e.g., open storage bucket) is catastrophic. |
| Hardware-security-module-backed server-side encryption with per-tenant keys | Reduces but does not eliminate server-side exposure (server can still request decryption); adds operational cost disproportionate to a single-user/small-team MVP. |

## Consequences

**Positive**
- Backend compromise or data exfiltration yields only ciphertext.
- Decouples backend trust from secret confidentiality — backend can be
  simpler and treated as semi-trusted storage/sync, not a security boundary
  for secrets.
- Aligns with industry-standard practice for consumer/prosumer secret
  managers, satisfying the stated user expectation.

**Negative**
- No server-side search, bulk admin recovery, or server-assisted sharing
  without additional client-side key-wrapping schemes (deferred; see Risks).
- Master password loss is unrecoverable by design unless a separate,
  explicitly-designed recovery mechanism is added (see Risks and Migration).
- All clients (mobile, web, any future CLI) must implement compatible crypto
  correctly — a lower-complexity backend trades complexity into every client.

## Risks and Mitigations

- **Recovery/lockout risk**: Losing the master password loses all secrets.
  Mitigation: offer an explicit, opt-in recovery kit (e.g., a one-time
  printable recovery key that wraps the master key) generated at enrollment;
  document that zero-knowledge inherently means "no password reset" unless
  this kit exists.
- **Client crypto bugs**: Incorrect implementation defeats the model.
  Mitigation: use one audited, cross-platform crypto library (e.g.
  libsodium bindings) shared across clients (see ADR-0002) rather than
  per-platform reimplementations.
- **Metadata leakage**: Even with encrypted values, backend-visible metadata
  (timestamps, item counts, sync frequency) can leak usage patterns.
  Mitigation: keep metadata minimal; do not encode item names/URLs in
  plaintext metadata — encrypt those too, only truly operational fields
  (opaque ID, revision, timestamp) stay in the clear.

## Migration, Rollout, and Rollback

- Net-new system: no migration from a prior plaintext store is required.
- Rollout: ship encryption/KDF/crypto library choice in the shared core
  (ADR-0002) before any client UI is built, since the on-disk/on-wire format
  is foundational and costly to change post-launch.
- Rollback: not applicable at this stage (pre-implementation decision); if a
  future ADR changes the crypto scheme, it must define an expand-and-contract
  re-encryption migration (decrypt with old key, re-encrypt with new) run
  client-side during unlock, never server-side.

## Validation

- Unit tests: KDF parameter correctness, encrypt/decrypt round-trip, tamper
  detection (authenticated-cipher tag rejection on modified ciphertext).
- Fitness function: a backend-only integration test asserting the storage
  layer never receives/logs a field matching known plaintext secret patterns.
- Security review/pen-test of the client crypto module before first release.

## Revisit Triggers

- Adding team/sharing features (requires per-recipient key-wrapping design).
- Adding server-side search or autofill-suggestion features that would
  tempt server-side plaintext access.
- Regulatory scope change (e.g., enterprise/compliance requirements) that
  mandates key-escrow.
