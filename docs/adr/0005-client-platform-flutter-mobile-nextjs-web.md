# ADR-0005: Client Platform — Flutter for Mobile, Next.js for Web

Status: Proposed

## Context

Two independent, mutually exclusive client-platform decisions were merged into
`main` without reconciliation (tracked as the blocking prerequisite **MSM-1** in
`docs/plan/mobile-secret-manager-mvp.md`):

- **Lineage A**: `docs/adr/0002-cross-platform-client-shared-core.md` chose a
  shared TypeScript core consumed by a React Native mobile app and a separate
  React web app.
- **Lineage B**: `docs/adr/0001-mobile-web-secret-manager-architecture.md`
  §1 chose a single shared Flutter (Dart) codebase across iOS, Android, and
  Web.

Both files are `Status: Proposed`; neither superseded the other, and both are
numbered `ADR-0001`, which this ADR also resolves by declaring an explicit
winner.

An authoritative product-owner directive has since been made that takes
precedence over both prior ADRs: **Flutter for mobile, Next.js for web**. This
ADR records that decision as the reconciling, superseding ADR MSM-1 requires.

Drivers:
- **Explicit product direction** overrides the two prior lineages; this is not
  a re-litigation of their tradeoffs but a recorded mandate, documented here so
  all downstream work has one authoritative reference.
- **Cross-surface parity / "easy integration"** (ADR-0001's original driver)
  is retained, but can no longer be satisfied by sharing UI or business-logic
  source, since Flutter (Dart) and Next.js (TypeScript/React) do not share a
  runtime. It must instead be satisfied by a shared, strictly-versioned API
  and data contract.
- **Team capacity** (single developer, per ADR-0002's driver): duplicating
  security-critical crypto/sync logic across two languages is real,
  non-trivial risk. This ADR does not eliminate that risk (ADR-0002's reason
  for rejecting Flutter+web-stack splits); it accepts it as a consequence of
  the product-owner directive and mitigates it with a shared contract and a
  cross-language test-vector suite (see Validation).
- **Web platform maturity**: Next.js gives a standards-track React app with
  mature routing, SSR/SSG, and hosting ecosystem — strictly better fit for web
  than Flutter Web (whose immaturity was already flagged as a rejection
  reason in ADR-0002's alternatives) and no worse a fit than ADR-0002's
  original plain React + bundler choice.
- **Mobile platform fit**: Flutter gives one codebase for iOS + Android with
  mature hardware-backed secure-storage and biometric packages, satisfying
  ADR-0004's biometric-gating design without a separate per-OS native
  implementation.

## Decision

Adopt a **per-platform codebase, shared-contract architecture**:

1. **Mobile**: Flutter (Dart), one codebase for iOS and Android. Local
   ciphertext storage via `flutter_secure_storage` (iOS Keychain / Android
   Keystore); biometric re-unlock gating per ADR-0004.
2. **Web**: Next.js (React + TypeScript), one codebase for the authenticated
   web app (and any public/marketing pages, which may use SSR/SSG). All
   vault cryptography (KDF, encrypt/decrypt) runs **client-side in the
   browser** via the Web Crypto API / a vetted JS crypto library — never in a
   Next.js server component or API route — preserving the zero-knowledge
   property from `0001-client-side-zero-knowledge-encryption.md`. The
   unlocked vault key lives in memory only for the tab's lifetime (no
   persistent browser storage of key material), carrying forward ADR-0002's
   web session-key handling.
3. **No shared UI or business-logic source between Flutter and Next.js.**
   Each platform implements the documented crypto/sync contract (KDF
   parameters, envelope format, conflict/version semantics) independently.
   Correctness parity is enforced by a shared, language-agnostic JSON
   test-vector suite consumed by both the Dart and TypeScript test suites
   (see Validation), not by shared source.
4. **Shared wire contract**: a single OpenAPI/JSON-Schema definition for the
   backend API (ADR-0006) is the source of truth for request/response shapes.
   Next.js and the TypeScript API consume it directly; Flutter mobile
   generates Dart models from the same schema in CI, so the three surfaces
   cannot silently drift on wire format even without shared source code.
5. **Supersedes**: `0001-mobile-web-secret-manager-architecture.md` §1
   ("Shared client codebase (Flutter) across iOS, Android, and Web" — the
   Flutter-for-web part only) and `0002-cross-platform-client-shared-core.md`
   in full (its React Native/React + shared-TS-core decision). The
   zero-knowledge principles, backend ciphertext-relay role, and key
   hierarchy from `0001-client-side-zero-knowledge-encryption.md`,
   `0001-mobile-web-secret-manager-architecture.md` §2–3, and ADR-0004 are
   platform-agnostic and remain fully authoritative, now implemented
   per-platform instead of via one shared core.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| ADR-0001's original choice: single Flutter codebase including Flutter Web | Rejected for web: superseded by explicit product direction favoring Next.js's web ecosystem maturity (routing, SSR/SEO, hosting) over Flutter Web, which ADR-0002 already flagged as immature. |
| ADR-0002's original choice: React Native mobile + React web, shared TS core | Rejected for mobile: superseded by explicit product direction mandating Flutter; also removes the premise (one shared TS core across both surfaces) that justified React Native in the first place, since mobile is no longer a JS/TS runtime. |
| Shared core in a cross-compiled language (e.g., Kotlin Multiplatform, Rust via FFI) callable from both Flutter and Next.js | Would close the "duplicated crypto logic" gap entirely, but adds a third toolchain/build system for a single-developer team at this stage; recorded as the fallback if contract/crypto drift becomes a recurring problem (see Revisit Triggers). |
| Flutter Web for web instead of Next.js | Keeps ADR-0001's "one UI codebase" ideal, but explicitly overridden by product direction and by ADR-0002's own prior finding that Flutter Web's platform integration lags a dedicated web stack. |

## Consequences

**Positive**
- Resolves the two-lineage conflict blocking MSM-1 and unblocks MSM-2 onward.
- Each platform gets its best-fit, idiomatic stack instead of a
  lowest-common-denominator compromise.
- Mobile release cadence (app-store review) is decoupled from web's
  continuous-deploy cadence, simplifying rollout sequencing versus either
  prior single-stack lineage.

**Negative**
- No source-level sharing between mobile and web: crypto/sync/conflict logic
  must be implemented and maintained twice (Dart and TypeScript),
  reintroducing the duplicated-security-critical-logic risk ADR-0002 was
  designed to avoid. This is an accepted tradeoff of the product directive,
  mitigated per Risks below.
- Requires new contract-governance tooling (OpenAPI/schema + generated models
  + shared test vectors) that neither prior lineage needed in the same form.
- Two toolchains (Dart/Flutter, TypeScript/Next.js) increase the single
  developer's total maintenance surface versus either prior single-stack
  lineage.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Dart and TypeScript crypto implementations silently diverge (different KDF params, envelope bugs) | Maintain a shared, versioned JSON test-vector suite (fixed keys/inputs/expected ciphertext); run it in both the Flutter and Next.js CI pipelines and fail CI on any mismatch. |
| Wire-format drift between Flutter's generated models and the Next.js/API TypeScript types | Single-source-of-truth OpenAPI/schema file lives in the API repo (ADR-0006); both clients regenerate models from it in CI and fail the build on any uncommitted diff. |
| Doubled security-review effort (two independent client crypto implementations) | Keep each platform's crypto surface minimal and isolated in a dedicated module; require the same manual security-review checklist (per ADR-0001) to pass for both implementations before any release. |
| Next.js server components/API routes accidentally handle plaintext secrets | Architectural rule: vault ciphertext is decrypted only in client components, never in Next.js server code; enforce via code review and a lint rule banning vault-decryption imports outside client-rendered modules. |

## Migration, Rollout, and Rollback

- Greenfield; no shipped clients exist, so no user-facing migration is
  required.
- Update `Status` in `0001-mobile-web-secret-manager-architecture.md` and
  `0002-cross-platform-client-shared-core.md` to reference this ADR as the
  superseding decision; their platform-agnostic crypto/backend content
  remains referenced from `0001-client-side-zero-knowledge-encryption.md`,
  `0003`/`0006`, and `0004`.
- Rollout order: (1) publish the OpenAPI contract and the shared test-vector
  suite, (2) implement Flutter mobile against ADR-0004/ADR-0006 (matches the
  existing MVP plan's Increment 1, mobile-first), (3) implement Next.js web
  against the same contract.
- Rollback: if maintaining two independent crypto implementations proves
  unsustainable for a single developer, the documented fallback is the
  cross-compiled shared-core alternative above; the contract package and
  test-vector suite carry over unchanged.

## Validation

- CI runs the shared JSON test-vector suite against both the Dart crypto
  module and the TypeScript/web-crypto module on every change.
- CI regenerates Flutter Dart models and the TypeScript types from the
  OpenAPI schema and fails the build on any uncommitted diff
  (contract-drift fitness function).
- The manual security-review checklist (per ADR-0001) is required for both
  the Flutter and Next.js crypto modules before any public release.

## Revisit Triggers

- Contract-drift or duplicated-crypto-bug incidents become frequent →
  revisit the cross-compiled shared-core alternative.
- Team grows beyond a single developer and can support a third toolchain →
  reconsider consolidating onto one stack.
- Flutter Web, or another unified-codebase option, becomes compelling enough
  to revisit the web-platform choice specifically.
