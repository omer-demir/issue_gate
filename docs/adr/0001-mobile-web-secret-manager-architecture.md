# ADR-0001: Zero-Knowledge Architecture for Cross-Platform Secret Manager

## Status
Proposed

## Context

`omer-demir/issue_gate` is currently an empty repository (only `README.md` with the
title `# issue_gate`; no source, manifests, CI, or prior architecture — confirmed via
`git show HEAD:README.md` and directory listing). This is a greenfield build; the
repository name has no bearing on the product.

**Request:** a personal secret manager (passwords/login details) that is:
1. Usable as a native mobile app and a web app, with "easy integration" between them.
2. Able to view, copy/paste, create, and update secret values.
3. Secured "like other secure services" — i.e., to the standard expected of
   established password managers.

**Drivers:**
- *Team capacity*: single developer/owner ("I"), operating solo — favors low
  operational overhead over maximal control.
- *Cross-surface parity*: explicit requirement for native mobile + web from one
  product, implying either a shared codebase or at minimum a shared sync backend
  and shared crypto contract.
- *Security bar*: no compliance target was specified (flagged as a gap by the
  design-context research). In the absence of a stated regulatory driver (e.g.
  SOC 2, HIPAA), the working bar is "industry-standard consumer password manager
  security": client-side (zero-knowledge) encryption, so the backend operator
  (even if it is the same person) never holds plaintext secrets or the key that
  unlocks them.
- *Offline use*: mobile password managers are expected to work without
  connectivity; this constrains the sync model (optimistic, offline-first) rather
  than requiring an always-online API.
- *Categorization*: user describes secrets spanning "web/work/personal" —
  implies simple tagging/category metadata, not multi-tenant team sharing (not
  requested; out of scope for v1, called out as an open question).
- *Reversibility*: no existing system to preserve; still, the chosen design
  should allow starting with a minimal vertical slice (single device, local
  only) and incrementally adding sync, without a rewrite.

## Decision

Adopt a **zero-knowledge, end-to-end-encrypted architecture** with three
structural decisions:

### 1. Shared client codebase (Flutter) across iOS, Android, and Web
One Dart codebase (Flutter) targets iOS, Android, and Web from the same UI and
business-logic layer, with a platform-isolated storage/crypto adapter layer
(see `SecretStore` interface below) swapped per platform. This directly
satisfies "integration easily ... both natively on mobile and web" without
maintaining three separate client stacks, which a single-developer project
cannot sustain long-term.

### 2. Thin "ciphertext relay" backend, not a full application server
The backend never receives, stores, or processes plaintext secrets or the
vault's encryption key. It stores only:
- Opaque, client-encrypted secret blobs (AES-256-GCM ciphertext + nonce + tag).
- Non-sensitive metadata needed for sync and listing: item ID, category tag,
  created/updated timestamps, a monotonic version counter.
- An authentication credential (Argon2id-hashed) that is **cryptographically
  independent from the vault master key** (see below), so a password reset or
  server-side credential rotation never requires decrypting or re-encrypting
  vault data.

This keeps the backend small (CRUD + auth + conflict/version bookkeeping),
auditable, and replaceable later without touching the client's crypto model.

### 3. Client-side key hierarchy and local secure storage
- **Master key**: derived from the user's master password via Argon2id (a
  memory-hard KDF chosen specifically to resist offline brute-force, which is
  the realistic threat if the ciphertext relay is ever compromised).
- **Vault Data Encryption Key (DEK)**: a random key generated once per vault,
  wrapped (encrypted) by the master key. All secret items are encrypted with
  the DEK, not directly with the master key. This allows master-password
  rotation by re-wrapping the DEK only, without re-encrypting every secret.
- **Local cache**: only ciphertext is ever written to disk. On mobile, ciphertext
  is persisted via OS-backed secure storage (iOS Keychain / Android Keystore,
  e.g. via `flutter_secure_storage`). On web, ciphertext is persisted in
  IndexedDB (browsers have no hardware-backed secure storage equivalent — this
  is a known, flagged limitation, mitigated by never persisting the derived
  master key or DEK on web; see Risks).
- **Session key handling**: the derived master key and unwrapped DEK live only
  in memory for the duration of an unlocked session. Mobile may offer
  biometric-gated re-unlock (Face ID / Touch ID / Android BiometricPrompt)
  backed by the OS keystore; web always requires re-entry of the master
  password per session (no `localStorage` persistence of key material).

## Alternatives Considered

| # | Option | Why not chosen as primary |
|---|---|---|
| A | Fully local, per-device only, manual export/import for sync | Fails the explicit "easy integration" / mobile+web parity requirement; user would hand-carry an encrypted file between devices. Simplest and zero backend risk, but under-delivers on the stated need. |
| B | Full custom backend (own auth, business logic, server-side encryption at rest) | Backend becomes a plaintext-adjacent trust boundary (even if encrypted at rest, server holds the means to decrypt unless specifically engineered not to) and a much larger attack surface and ops burden for a solo developer — rejected unless the zero-knowledge property is explicitly dropped. |
| C | Self-host a proven compatible server (e.g., a Bitwarden-protocol-compatible server) and build only custom clients against it | Reuses a battle-tested, open, well-reviewed crypto/sync protocol and avoids reinventing vault security — a strong contender. Rejected as the *primary* decision only because it constrains the client to that protocol's data model/API and still requires running and maintaining a server component; recorded as the preferred fallback if the custom thin-relay backend (Decision 2) proves too costly to build/operate (see Revisit Triggers). |
| D | Separate native clients (Swift/Kotlin) + separate web stack (e.g., React), sharing only an API contract | Maximizes per-platform idiomatic UX and avoids Flutter Web's maturity gaps, but triples UI implementation and crypto-code surface for a solo developer — directly conflicts with the "team capacity = 1" driver and the "easy integration" requirement. |

Decision: **Primary = shared Flutter client + custom thin ciphertext relay
(Decision 1+2+3 above). Fallback = Option C** if building/operating the thin
backend proves too costly (see Revisit Triggers).

## Consequences

**Positive**
- Backend compromise alone cannot expose plaintext secrets (ciphertext-only
  storage + independent auth secret).
- Single codebase reduces the chance mobile and web drift apart in behavior or
  security posture — a real risk when "easy integration" is a stated goal.
- Master-password rotation is cheap (re-wrap DEK only), supporting a secure,
  low-friction key-rotation story.
- Offline-first works naturally: client always has a local encrypted cache it
  can read/write without the relay being reachable.

**Negative**
- Web clients cannot achieve the same secure-storage guarantees as mobile OS
  keystores; this is a structural limitation of browsers, not a Flutter issue,
  and must be explicitly communicated to the user (e.g., "web sessions do not
  persist your vault key").
- Flutter Web is less mature than Flutter mobile for some UI polish and browser
  API access; this is a deliberate trade for code-sharing and must be
  prototyped early to confirm viability (see Validation).
- Building a custom sync/conflict protocol (even a thin one) is nontrivial and
  carries its own risk of subtle bugs in versioning/merge logic — mitigated by
  keeping the protocol minimal (last-write-wins + user-visible conflict
  surfacing) rather than attempting general CRDT merge logic in v1.
- Zero-knowledge means **lost master password = unrecoverable vault** unless a
  recovery mechanism is designed in from day one (see Interfaces: Recovery Kit).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Browser (web) cannot securely hold key material at rest | Never persist master key/DEK beyond the in-memory session; require re-authentication per browser session; document the exposure window to the user. |
| Lost master password is unrecoverable by design | Issue a one-time, user-stored **Recovery Kit** (a high-entropy recovery key that independently wraps the DEK) at vault creation, analogous to Bitwarden/1Password recovery codes. |
| Clipboard-based "copy" is a classic exfiltration vector (other apps/clipboard managers can read it) | Auto-clear the OS clipboard after a short TTL (default 30s, configurable); on Android, mark clipped data `isSensitive`; on iOS, use `UIPasteboard` with an expiration/local-only option; on web, clear via `navigator.clipboard` best-effort (browsers limit programmatic clearing — document as a known, accepted residual risk on web). |
| Sync conflicts (same secret edited offline on two devices) | Per-item monotonic version counter; last-write-wins is the default merge, but both versions are retained server-side for a short window and the losing write is surfaced to the user as "conflicting edit" rather than silently discarded. |
| Thin relay is still a single point of compromise for availability (not confidentiality) | Out of scope for v1 (single user, no HA requirement); revisit if usage or stakes grow (see Revisit Triggers). |
| Argon2id may be unavailable or too slow on some constrained web/mobile runtimes | Use the platform's best available memory-hard KDF; if Argon2id is unavailable, fall back to PBKDF2-SHA256 with a high iteration count, and record which KDF + parameters were used per-vault so future unlocks remain compatible. |

## Migration, Rollout, and Rollback

1. **Phase 0 (this ADR)**: no code yet; establishes the contract for all
   downstream implementation work.
2. **Phase 1 — local-only vertical slice**: implement the Dart crypto core,
   local secure storage adapter, and basic CRUD UI on one platform (mobile)
   with no backend. This validates the crypto/storage contract in isolation
   and is independently useful (no sync dependency yet) — rollback is simply
   not proceeding to Phase 2.
3. **Phase 2 — add the thin relay + sync**: introduce the backend contract
   (below), wire up account creation/login, and add sync to the mobile client.
   Rollback = disable sync feature flag; local-only mode continues to work.
4. **Phase 3 — Flutter Web target**: enable the web build once the shared
   core is stable; web ships with its storage-limitation disclosure. Rollback
   = do not publish the web target; mobile is unaffected since the core is
   platform-agnostic.
5. **Fallback trigger**: if the custom relay's sync/versioning logic proves too
   risky or time-consuming to get right, substitute a Bitwarden-protocol-
   compatible self-hosted server (Option C) behind the same client-side
   `SyncClient` interface (below) — the client crypto core does not need to
   change, only the sync adapter.

## Validation

- Unit tests for the crypto core: key derivation determinism, wrap/unwrap
  round-trips, AES-GCM encrypt/decrypt round-trips, tamper-detection
  (corrupted ciphertext/tag must fail to decrypt, never silently return
  garbage plaintext).
- Integration test: simulate two "devices" (two in-memory `SecretStore`
  instances) editing the same item offline, then syncing, to verify conflict
  surfacing behaves as specified.
- Manual security review checklist before any public release: no plaintext or
  key material in logs, crash reports, or backups; clipboard TTL behavior
  verified on both OSes; web session key non-persistence verified.
- Fitness function (ongoing): a CI check that fails the build if any
  dependency change introduces a plaintext secret field in the backend's data
  model (schema review on the sync API contract).

## Revisit Triggers

- Requirement expands to **multi-user sharing** (e.g., sharing a "work" secret
  with teammates) — changes the key-hierarchy and auth model materially
  (needs per-recipient key wrapping or a group-key scheme); revisit this ADR.
- Flutter Web proves inadequate (performance, missing browser API, e.g.
  reliable clipboard/biometric WebAuthn integration) during Phase 3 validation
  — revisit Decision 1 and fall back to Option D for the web surface only.
- Usage grows beyond a single user/device set such that relay availability or
  scale becomes a real concern — revisit the "thin relay, no HA" choice.
