# Documentation

Start with the [root README](../README.md) for local setup, commands, and the tech stack.

## Current implementation

| Guide | Contents |
|---|---|
| [Backend](../backend/README.md) | API, runtime settings, storage, and backend development |
| [Web](../web/README.md) | Browser setup, configuration, and client development |
| [Mobile](../mobile/README.md) | Flutter setup, native integration, and device checks |
| [Architecture](design/mobile-secret-manager-architecture.md) | Component boundaries and implementation limitations |
| [Technical reference](design/mobile-secret-manager-technical-design.md) | Encryption, data flow, and contract maintenance |
| [UX reference](design/mobile-secret-manager-design-handoff.md) | Account login, vault unlock, recovery, and offline behavior |
| [Docker and VPS](ops/docker-and-vps.md) | Container operations and deployment prerequisites |

## Decisions and planning

The [MVP plan](plan/mobile-secret-manager-mvp.md) records story IDs and acceptance criteria, not a release-status report or setup guide. Some planned capabilities are not implemented; use the guides above for current behavior.

Architecture decision records preserve the rationale and alternatives considered at the time. Their validation sections describe required checks, not evidence that those checks have run. Existing statuses are retained; a proposed ADR is not proof of an implemented feature.

| Record | Scope |
|---|---|
| [ADR-0001: client-side encryption](adr/0001-client-side-zero-knowledge-encryption.md) | Encryption trust boundary; current KDF details are in the technical reference |
| [ADR-0001: cross-platform architecture](adr/0001-mobile-web-secret-manager-architecture.md) | Earlier architecture; platform/storage choices superseded by ADR-0005/0006 |
| [ADR-0002](adr/0002-cross-platform-client-shared-core.md) | Historical shared TypeScript core; superseded by ADR-0005 |
| [ADR-0003](adr/0003-minimal-custom-sync-backend.md) | Custom sync backend rationale; relational storage superseded by ADR-0006 |
| [ADR-0004](adr/0004-master-password-kdf-unlock-with-biometric-gating.md) | Separate account authentication and vault unlock |
| [ADR-0005](adr/0005-client-platform-flutter-mobile-nextjs-web.md) | Flutter mobile and Next.js web with independent implementations |
| [ADR-0006](adr/0006-typescript-api-nosql-store.md) | TypeScript API and document-store direction; persistent adapter not yet implemented |

Two historical files use ADR-0001. Use their full filenames or descriptive link titles to distinguish them; existing paths are retained to avoid breaking references. ADR-0005 and ADR-0006 reconcile the platform and storage choices, not the numbering.

## Updating documentation

Keep setup commands in the root README and component-specific details in the corresponding component README. Document environment defaults and restart/rebuild requirements alongside configuration changes. Keep API shapes in the backend guide and encryption compatibility details in the technical reference rather than duplicating them across clients.

Update these guides when behavior changes. Keep stories in the plan, and preserve prior ADRs when a new decision supersedes them. Do not put task handoffs, past command transcripts, or unverified completion claims in operational guides.
