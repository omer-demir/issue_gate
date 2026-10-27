# Architecture

This guide describes the current source tree. For commands and environment setup, start with the [root README](../../README.md). Historical rationale and the original delivery plan are indexed in [Documentation](../README.md); proposed features in those records are not necessarily implemented.

## Components and boundaries

```text
Flutter mobile                         Next.js web
Dart UI + vault repository              React UI + providers
Dart cryptography                      Browser Web Crypto
          |                                     |
          | HTTPS/JSON                           | Same-origin /v1 proxy
          +------------------+------------------+
                             |
                    TypeScript / Express API
                    Authentication + item sync
                             |
                    InMemoryDocumentStore
```

Mobile and web have independent crypto, state, and API implementations. They share a wire format, not source code. The backend handles account authentication, KDF metadata, conditional item updates, and change-feed pagination. No persistent NoSQL vendor has been integrated.

The local web proxy is a development configuration in `deploy/Caddyfile.local`, not an application service or deployment. It preserves `/v1` and forwards browser API calls to Express, avoiding cross-origin requests without exposing a permissive CORS policy.

## Data ownership

| Data | Current handling |
|---|---|
| Account email and login password | Sent to the API for registration/login; password stored as a salted scrypt hash |
| Master password | Used client-side to derive the vault wrapping key; not sent to the API |
| Unwrapped data encryption key (DEK) | Held by the client; mobile also has an optional secure-storage cache for biometric convenience |
| Secret title, username, password, URL, notes | Encrypted client-side into item ciphertext before upload |
| Item ID, owner ID, revisions, timestamps, change sequence | Visible to the API for authorization and synchronization |
| Vault salt, KDF parameters, wrapped DEKs | Stored by the API as metadata and a reserved opaque item |
| Recovery key | Displayed to the user for out-of-band safekeeping, not uploaded |
| Account tokens | Browser `sessionStorage`; mobile platform secure storage |

"Ciphertext-only backend" refers to vault contents, not all server data: the API necessarily handles account credentials and operational metadata. Encryption does not prevent deletion, metadata exposure, compromised-client access, or offline guessing of weak master passwords. This is a design boundary, not evidence of a completed security audit.

## Source layout

| Directory | Responsibility |
|---|---|
| `backend/src/routes/`, `services/`, `store/` | HTTP boundary, behavior, persistence |
| `web/src/lib/`, `store/`, `app/` | Browser crypto/transport, state, routes |
| `mobile/lib/src/core/`, `ui/` | Mobile crypto/transport/storage/sync, screens |
| `deploy/`, root Compose files | Local proxy and backend hosting configuration |
| `docs/adr/` | Decision history and trade-offs |
| `docs/plan/` | Original stories and acceptance criteria |

See the [technical reference](mobile-secret-manager-technical-design.md) for key wrapping and compatibility, the [backend guide](../../backend/README.md#api) for the API contract, and the [UX reference](mobile-secret-manager-design-handoff.md) for user-facing semantics.

## Current limitations

| Area | Implemented state and remaining work |
|---|---|
| Durability | API accounts, sessions, KDF records, and items are in memory. A restart loses all of them. No database container or environment variable makes storage durable. |
| Offline persistence | Client item caches and queues are in memory. Reload/process death loses pending work; IndexedDB/SQLite offline persistence is not implemented. |
| Crypto | PBKDF2-SHA256 and AES-256-GCM are implemented; Argon2id and the ADR's item-context associated-data binding are not. |
| Contract parity | TypeScript/Dart models are hand-maintained; no OpenAPI/schema generation pipeline or shared crypto test-vector suite exists. |
| Mobile integration | Native runners are absent. Link parsing exists but incoming OS links are not wired; secure-storage/biometric behavior requires platform review. |
| Sessions | API refresh/rotation exists, but clients do not automatically call refresh; expired sessions require signing in again. Account-password reset and device-management UI are absent. |
| Sync retention | Retention configuration is not wired into runtime compaction; tests simulate a floor, but full resync after raising it still needs implementation work. |
| Deployment | No CI, app signing/distribution, durable backups, or operational monitoring pipeline is present. The VPS Compose topology needs corrections before use. |

Use disposable data until these requirements have been resolved and reviewed. In particular, the optional mobile DEK cache stores base64 raw bytes through secure storage with a separate UI biometric prompt; it does not establish the stronger OS-enforced biometric key-release guarantee envisioned in the ADRs.

## Decision history

[ADR-0005](../adr/0005-client-platform-flutter-mobile-nextjs-web.md) records Flutter mobile plus Next.js web, replacing the earlier shared React Native/TypeScript core and Flutter Web proposals. [ADR-0006](../adr/0006-typescript-api-nosql-store.md) records the TypeScript API/document-store direction, replacing relational storage. Their schema-generation and verification goals remain unfinished.

Client-side encryption, separate account login/master password, and revision-conflict handling remain the central design constraints. Do not infer implementation completion from an ADR's status or validation checklist. Changes to key hierarchy, durable storage, or incompatible wire formats need a new decision record and a migration plan; normal setup corrections belong in the operational guides.
