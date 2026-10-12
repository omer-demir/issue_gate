# Design Handoff: Mobile + Web Secret Manager

Reconciles the UX design (ux-design stage output, delivered as a stage summary — not yet
persisted as a repository file) with the [technical design](./mobile-secret-manager-technical-design.md)
and [ADR-0001](../adr/0001-mobile-web-secret-manager-architecture.md) (technical-design stage) into
one coherent handoff for planning/implementation agents. This document does not repeat either
source in full; it states what each got right, closes the gaps between them, and records explicit
decisions on every UX-raised open question.

## 1. Alignment check (no conflicts found)

The two designs were produced independently but are consistent on every point both addressed:

| Topic | UX design | Technical design / ADR-0001 | Verdict |
|---|---|---|---|
| Clipboard copy | "Copied — clears in 30s", TTL auto-clear required | 30s default TTL, `isSensitive`/`UIPasteboard` handling, web residual risk documented (ADR Risks, line 134) | Consistent |
| Login secret vs. master password | Flagged as open question #1 (same or separate?) | Decided: independent account-login secret distinct from master password, so password reset never touches the vault key (ADR §Decision, tech design §3.3 `authVerifier` note) | **Resolved — see §2.1** |
| Lost master password | Flagged as open question #3 (recovery story) | Recovery Kit (random recovery key independently wraps the DEK), issued at vault creation, exported/user-stored (ADR Risks + tech design §2, §3.1) | **Resolved — see §2.2** |
| Conflicting concurrent edits | "No silent overwrite... side-by-side, user picks or merges" | `409 version_conflict` surfaced to user with both versions; no auto-merge (tech design §3.3–3.4) | Consistent, UX's side-by-side screen is the correct UI for this contract |
| Sharing/teams, "work" category | Flagged as open question #2, category is tag not permission boundary | Explicitly out of scope v1; revisit trigger defined if requirement expands (ADR Revisit Triggers) | Consistent — no permission-denied UI needed for v1 |
| Sync/offline status UI | Sync indicator + offline banner + pending-sync badge | `SecretStore` is local-authoritative; `pendingChangesSince` queues writes for upload | Consistent |

## 2. Decisions closing the remaining UX open questions

### 2.1 Login secret vs. master password — **separate, confirmed**
Use two independent secrets: an account-login credential (authenticates the device/session to the
relay) and the vault master password (derives the key hierarchy, never transmitted). Rationale:
a relay-side credential reset (forgotten login password) must never require or imply master-key
recovery, and vice versa. **Implication for UX**: onboarding and "forgot password" flows must be
two distinct flows with distinct copy — "reset your account password" (relay-side, recoverable) vs.
"recover your vault" (master password, requires the Recovery Kit, ADR Risks). The UX flows in
Flow 1 (Unlock) should be updated to prompt for the **master password**, not a generic "password",
and a separate low-frequency "Account settings" surface (not yet designed) owns login-credential
reset. Flagged for the next UX pass: design the two reset entry points so a user under the stress
of being locked out is not misdirected into the wrong one.

### 2.2 Account recovery — **Recovery Kit, confirmed**
At vault creation, issue a one-time Recovery Kit (high-entropy recovery key wrapping the DEK
independently of the master password), analogous to Bitwarden/1Password recovery codes. **UX
action required** (not yet designed, carried forward as a gap): an explicit onboarding step that
(a) generates and displays the kit, (b) forces an acknowledgment that it is the only recovery path
before continuing, and (c) a corresponding "I have my Recovery Kit" entry point on the Lock screen
for the master-password-lost case. This is a new flow, not covered by UX Flow 1's "first-time use"
step as currently described.

### 2.3 Biometric unlock — **optional convenience, never the sole credential**
Resolved: biometric unlock (mobile only) wraps a *re-unlock convenience token* in the OS
Keychain/Keystore; it is never a substitute for the master password at Recovery-Kit or
new-device-enrollment time (tech design §3.2). Decision for the UX open question ("mandatory or
optional, what's the fallback"): **optional, user-enabled at onboarding, with master-password
entry always available as the explicit fallback** when biometrics are unavailable, disabled at the
OS level, or fail. No change needed to UX Flow 1 — it already specifies this fallback behavior
correctly.

### 2.4 Offline read/write — **supported on both platforms, with a web-specific residual-risk caveat**
Resolved: `SecretStore` is a shared interface (tech design §3.2); both mobile and web read the
local/cached vault and queue writes via `pendingChangesSince` when offline, surfaced via the sync
indicator and pending-sync badges UX already designed (State Matrix, Vault list row). The
difference between platforms is **where the wrapped key material lives**, not whether offline
read/write works: mobile backs it with Keychain/Keystore, web with IndexedDB ciphertext-only (no
OS-grade key isolation — ADR Risks, documented limitation). **No new UX work required** — the
offline/pending-sync states already designed apply uniformly to both platforms; the residual-risk
caveat is a security posture note, not a UX behavior difference.

## 3. Items explicitly carried forward (not resolved here, require follow-up)

These remain open after this synthesis and should go to planning/product, not implementation,
before the affected surfaces are built:

1. **Multi-device revocation UI** (tech design open question #2): no "log out other sessions" or
   device-list screen is designed yet. Needed before Phase 2 (multi-device sync) ships.
2. **Backup/export format** (tech design open question #3): whether users can export an encrypted
   vault file, and in what format. No UX flow exists for this yet.
3. **Onboarding flows for §2.1 and §2.2 above**: two new UX flows are required (account-password
   reset vs. vault recovery; Recovery Kit issuance) before implementation of onboarding/auth
   screens begins. These are UX design gaps, not technical ones — the technical contracts
   (`CryptoCore.generateRecoveryKit`-equivalent, per tech design §3.1) already support them.
4. **Sharing/teams**: confirmed out of scope for v1 by both designs; revisit only if the
   requirement set expands (ADR Revisit Triggers).

## 4. Interface/contract status

No changes to the contracts defined in the technical design are required by this reconciliation.
`CryptoCore`, `SecretStore`, `SyncClient` (tech design §3) and the ADR's key hierarchy stand as
specified. The only additions are the UX-flow clarification in §2.1 (two distinct reset entry
points) and the two new onboarding flows in §3 above — both are UX-design-stage work, not
architecture changes.

## 5. Handoff notes for planning agents

- Build order should follow the tech design's phased plan (ADR Migration/Rollout): local-only
  mobile crypto core + UI first (independently shippable), then relay sync, then web client.
- Before UI implementation of onboarding/Lock-screen/Account-settings starts, commission the two
  carried-forward UX flows in §3 above (reset vs. recovery; Recovery Kit issuance) — implementing
  against the current UX summary alone would conflate the two reset paths.
- Treat §2.4's offline parity as a fitness function: a test plan should verify pending-sync badges
  and conflict resolution behave identically on mobile and web, since the UX summary did not
  originally distinguish them and the technical doc only tabulated "Availability (mobile)"
  explicitly.
- No new ADR is required for this synthesis; all decisions above are clarifications/closures of
  already-decided architecture (ADR-0001), not new architectural tradeoffs.
- **Recommend persisting the UX design as a repository artifact** (e.g.
  `docs/design/mobile-secret-manager-ux-design.md`) so future stages can cite it directly instead
  of relying on the stage-summary text; this handoff currently cites the ux-design stage summary
  because no such file exists yet.
