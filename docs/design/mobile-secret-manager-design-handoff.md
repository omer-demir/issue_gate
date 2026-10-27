# UX behavior and development reference

This guide replaces the earlier task-stage handoff with the account/vault behavior developers need to preserve. It distinguishes intended UX from current limitations; use the [architecture guide](mobile-secret-manager-architecture.md#current-limitations) for implementation status and the [technical reference](mobile-secret-manager-technical-design.md) for formats and data flows.

## Account login versus vault unlock

Use distinct labels and distinct secrets:

| Operation | Credential | Responsibility |
|---|---|---|
| Account registration/login | Account password | API authenticates access to the user's encrypted data |
| Vault setup/unlock | Master password | Client derives a key and unwraps the DEK locally |
| Vault recovery | Recovery Kit plus a new master password | Client recovers and re-wraps the existing DEK |
| Biometric convenience | Device biometric prompt and cached key | Mobile-only alternative after a prior password-based unlock |

Do not imply that the account password can unlock the vault, or that a server operator can recover the master password. Users should choose different account and master passwords. An expired API session is distinct from an incorrect master password and should not be presented as a decryption failure.

Account-password reset, a device/session-management UI, and "log out other sessions" are not implemented. Vault recovery must not be labeled as account-password reset.

## Onboarding and Recovery Kit

The flow is account registration/login, vault setup, Recovery Kit display/acknowledgment, then the vault list. The kit is generated client-side and should be saved by the user outside the application. Never put it in logs, analytics, URLs, or clipboard-history screenshots used for issue reports.

Recovery uses the kit to unwrap the vault key and set a new master password. It still requires account access and the encrypted vault metadata/items; it is not a backup of the vault itself. Losing both the master password and Recovery Kit leaves no designed recovery path. Losing server data cannot be repaired with a Recovery Kit alone.

Keep the saved-kit acknowledgment and recovery entry point explicit. Review registration, setup, unlock, and recovery on both clients rather than assuming identical behavior from similar screen names.

## Biometric unlock

Biometrics are optional convenience, not the only credential or a replacement for new-device password/recovery flows. Always retain a master-password fallback for unsupported hardware, denial, lockout, and cleared caches.

The current mobile implementation uses a UI biometric prompt plus a secure-storage DEK cache. It does not establish OS-enforced biometric key release, and native runners/integration are incomplete. See [mobile integration](../../mobile/README.md#native-integration). Web has no biometric vault-unlock path.

## Secret viewing and clipboard

Secret fields are decrypted on the client for display, editing, and copying. Keep password reveal explicit and avoid carrying plaintext into logs, crash reports, or server-rendered web code. Copy feedback should communicate the scheduled 30-second clipboard clear without promising erasure: backgrounding, permissions, other applications, or clipboard managers can defeat clearing or retain previous contents.

Keep form labels, validation feedback, and status announcements accessible. A password-strength indicator is usability feedback, not a cryptographic guarantee.

## Offline state and conflicts

Show offline/pending-sync status separately from successful server persistence. Both clients have in-memory state and pending-operation handling, but neither has a durable offline vault. A tab reload or app restart can lose unsynced work; do not promise offline recovery across restarts. A connectivity signal is not proof of API reachability.

A `409 version_conflict` means the server did not accept the submitted revision. Preserve the distinction between local and server versions and require an explicit user choice. The current conflict UI offers keep-mine/keep-theirs, not a general field-level merge or "keep both" workflow. The server is not an archive of rejected edits; do not imply they can be recovered later.

## Review checklist

Use disposable data and verify on each client:

- Registration/login, first setup, saved-kit acknowledgment, lock/unlock, and recovery with valid and invalid credentials.
- Create/view/edit/delete, password reveal/copy feedback, and clipboard behavior under backgrounding or permission denial.
- Offline edits, reconnect, failed sync, and reload/process-death loss; pending status must not imply durable storage.
- Two sessions editing the same item and each conflict choice, including delete conflicts.
- Expired account tokens, sign-out, and local key/cache handling.
- Mobile biometric fallback and links arriving before authentication or while the vault is locked.

Sharing/teams, encrypted export/backup, account reset, device revocation UI, and durable offline storage require further design and implementation. Keep their acceptance criteria in the [MVP plan](../plan/mobile-secret-manager-mvp.md) or a new decision record, not as claims in setup documentation.
