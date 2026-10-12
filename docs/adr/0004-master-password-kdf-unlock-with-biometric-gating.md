# ADR-0004: Master-Password + KDF Unlock with Platform Biometric Gating

Status: Proposed

## Context

ADR-0001 requires a master key derived client-side; this ADR decides the
concrete authentication/unlock UX: how a user proves identity to the backend
(account auth) versus how they unlock their local encrypted vault
(encryption auth), and how biometrics/SSO fit in.

Drivers:
- Must not weaken the zero-knowledge property from ADR-0001 (biometrics/SSO
  cannot become a backdoor to the master key).
- Usability: unlocking on mobile via biometrics is a strong, expected UX for
  this product category.
- Single-user scope today (per research), so enterprise SSO is not an
  immediate driver, but the design should not preclude it later.

## Decision

Separate two distinct concerns:

1. **Account authentication** (proves "who is calling the sync API"): a
   standard username/password (or passkey/OAuth later) exchange yielding a
   short-lived access token + refresh token. This has no bearing on secret
   confidentiality — it only gates API access to the user's own encrypted
   blobs (ADR-0003).
2. **Vault unlock** (derives the master key that decrypts blobs): a
   master password run through Argon2id (ADR-0001) to derive the master key.
   On mobile, after the first successful derivation, the derived key is
   cached only in the OS-backed secure enclave (iOS Keychain with biometric
   protection / Android Keystore with `BiometricPrompt`-gated access), so
   subsequent app opens can unlock via Face ID/Touch ID/Android biometrics
   instead of re-typing the master password. On web, the derived key lives
   only in memory for the tab's lifetime (ADR-0002) — no persistent
   biometric-backed cache, since browsers lack an equivalent secure enclave
   API.

Account authentication and vault unlock use **different secrets**: the account
credential authenticates to the backend, while the master password is used
only on the client for vault key derivation and is never sent to the backend.
Reusing the account credential as the master password is prohibited; this
separation ensures compromise of account authentication does not provide the
secret needed to derive the vault key.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Single combined password doing double duty for both account login and key derivation | Rejected because the account-auth service handles the login credential; reusing it would let an account credential compromise expose the value needed to derive the master key, collapsing the two trust boundaries ADR-0001 relies on keeping separate. |
| SSO/OAuth as the only account-auth and unlock mechanism (e.g., "Sign in with Google" unlocks the vault) | Convenient, but an identity provider cannot supply the master key for client-side decryption without the provider (or backend) learning/holding it, which breaks zero-knowledge; SSO can still gate *account access* later as an addition to, not a replacement for, the master-password-derived key. |
| Biometrics as the sole unlock factor with no master-password fallback | OS biometric caches are good at protecting an already-derived key but are not a key-derivation source themselves; also needs a password fallback for new devices, OS biometric resets, or failures. |

## Consequences

**Positive**
- Compromise of account credentials (e.g., leaked password reused
  elsewhere) does not by itself expose the vault, since it doesn't yield the
  master key.
- Native biometric unlock on mobile meets the "native" UX expectation from
  the request without weakening the underlying encryption model.
- Leaves room to add SSO/passkeys for account auth later purely as a
  convenience/access-gate layer, independent of this ADR's vault-unlock
  decision.

**Negative**
- Two distinct secrets (account credential vs. master password) can confuse
  users who expect one login; onboarding must clearly explain that the master
  password cannot be the account credential.
- Losing the master password with no recovery kit configured is, by design,
  unrecoverable (see ADR-0001 risk).

## Risks and Mitigations

- **Biometric cache misuse**: a jailbroken/rooted device could potentially
  extract the enclave-protected key. Mitigation: rely on platform-provided
  guarantees (Secure Enclave/StrongBox) rather than custom key-wrapping;
  document that full security assumes an uncompromised OS.
- **User confusion over two passwords**: Mitigation: onboarding flow that
  clearly distinguishes the account credential from the master password and
  requires them to be different.

## Migration, Rollout, and Rollback

- Net-new; no existing accounts to migrate.
- Rollout: ship master-password unlock first (web + mobile); add
  biometric-gated local caching as a mobile-only enhancement once the base
  unlock flow is validated.
- Rollback: biometric caching can be disabled per-platform without affecting
  the backend or the web client, since it is purely a local key-caching
  convenience layered on top of the core unlock flow.

## Validation

- Unit tests: KDF determinism (same password + salt → same key), rejection
  of wrong master password, correct behavior when biometric cache is cleared
  (falls back to password prompt).
- Manual/security test: confirm no plaintext or derived key is ever sent to
  or logged by the backend (static analysis / log-field review of the
  account-auth endpoints).

## Revisit Triggers

- Enterprise/team scope requiring SSO-based account access control.
- Introduction of passkeys/WebAuthn as an account-auth mechanism.
