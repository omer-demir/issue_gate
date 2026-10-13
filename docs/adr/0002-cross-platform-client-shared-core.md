# ADR-0002: Cross-Platform Client with a Shared Encryption/Sync Core

Status: Superseded by ADR-0005 (`0005-client-platform-flutter-mobile-nextjs-web.md`)

> **Note (superseded):** the product owner has mandated Flutter for mobile and
> Next.js for web as separate codebases, overriding this ADR's React Native +
> shared-TypeScript-core decision. This ADR is kept for historical context;
> its dependency-direction and adapter-interface guidance (core independent of
> transport/persistence) is restated per-platform in ADR-0005.

## Context

The request requires both a native mobile experience and web usage with easy
integration between them ("use natively on mobile and web"). ADR-0001
mandates that every client correctly implements the same client-side
encryption, KDF, and sync-conflict logic — duplicating that logic per
platform (separate Swift/Kotlin/TypeScript implementations) multiplies the
risk of subtle crypto or merge-logic bugs across platforms.

Drivers:
- Correctness/consistency of security-critical code across platforms.
- Small team/solo-maintainer scale (single user initially, per research
  brief) — cost of maintaining 3 separate native codebases is
  disproportionate.
- Need for native mobile feel (biometric unlock, OS keychain integration,
  share-sheet/autofill extension support later).
- Team capacity: unstated, but greenfield repo and single-user framing
  suggest a small team; assume small team unless corrected.

## Decision

Build a **shared TypeScript "core" library** containing all
platform-independent domain logic — encryption/decryption, KDF, vault data
model, sync/merge logic, validation — with zero dependency on UI or
transport framework. Ship two thin clients that consume this core:

- **Mobile**: React Native app (iOS + Android from one codebase), using
  native modules only for platform secure storage (iOS Keychain/Secure
  Enclave, Android Keystore) and biometric prompts.
- **Web**: a web app (e.g., React + a bundler) reusing the same core library
  via npm workspace and using the Web Crypto API. WebAuthn may authenticate
  the account but does not provide persistent storage for arbitrary vault
  keys. The unlocked vault key remains in memory only for the tab's lifetime;
  no persistent browser storage is used.

Domain logic (core) is kept independent of transport and persistence: the
core exposes pure functions/classes for encrypt/decrypt/merge and an
interface (`SecretStorageAdapter`, `SyncTransport`) that each platform
implements against its own secure storage and HTTP client.

## Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Fully native apps (Swift/SwiftUI + Kotlin/Jetpack Compose) + separate web app, each reimplementing crypto/sync | Triples the surface area for security-critical logic; higher long-term maintenance cost inconsistent with single-user/small-team scale; best native polish, but not justified yet. |
| Flutter (Dart) for mobile + separate web stack | Would still duplicate core logic in Dart vs. TypeScript for web; Dart does not let web and mobile share the same core module as directly as a TS monorepo would. |
| Single Flutter codebase for mobile **and** web (Flutter Web) | Avoids duplication, but Flutter Web's platform integration (clipboard behavior, autofill, PWA installability) is less mature than a dedicated web app; crypto library ecosystem is smaller/less audited than Web Crypto/libsodium-js. |

## Consequences

**Positive**
- One audited implementation of encryption/KDF/merge logic shared by both
  platforms reduces risk highlighted in ADR-0001.
- Faster delivery for a small team; single codebase for most logic and UI
  patterns (React Native + React share component mental model).
- Clear dependency direction: core has no knowledge of React Native, DOM, or
  HTTP specifics, only abstract adapter interfaces — easing future platform
  additions (e.g., CLI, browser extension) without touching crypto code.

**Negative**
- React Native apps are generally slightly heavier and can lag native UX
  polish for OS-level integrations (e.g., autofill credential provider,
  share extensions) compared to fully native apps; these will likely need
  small native-module bridges when built.
- Web is an inherently weaker secure-storage boundary than mobile OS
  keychains; this must be called out to users (e.g., warn about session
  persistence in browser storage) rather than implied as equally secure.

## Risks and Mitigations

- **Native-module bridge bugs**: Keychain/Keystore bridges are
  security-critical. Mitigation: use well-maintained community libraries
  (e.g., `react-native-keychain`) rather than hand-rolled native modules
  where possible.
- **Web storage weakness**: Browser tabs/extensions can be more exposed.
  Mitigation: keep unlocked session key in memory only (not localStorage),
  re-prompt master password on tab reload, and document this as a stated
  security tradeoff.

## Migration, Rollout, and Rollback

- Greenfield; no existing clients to migrate.
- Rollout order: core library → web client (fastest feedback loop) → mobile
  client, since web has no app-store review cycle.
- Rollback: if React Native proves inadequate for required native
  integrations (e.g., autofill), the shared core's adapter-interface design
  allows replacing only the mobile shell with native code without touching
  core crypto/sync logic or the web client.

## Validation

- Shared core has its own test suite (unit tests) run identically in CI for
  both the web and mobile build pipelines, ensuring one source of truth.
- Fitness function: lint/dependency-boundary check (e.g., a module
  boundary rule) preventing the core package from importing React Native or
  DOM-specific APIs.

## Revisit Triggers

- Need for deep OS integration (system-wide autofill, share-sheet) that
  React Native bridges cannot reasonably support.
- Team grows and can support fully native codebases.
- **(Occurred)** Product direction mandated Flutter mobile + Next.js web —
  see ADR-0005, which supersedes this ADR.
