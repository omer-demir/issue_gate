# Issue Gate — Mobile (Flutter)

Flutter (Dart) client for iOS and Android implementing the Mobile Secret
Manager MVP's mobile stories (`docs/plan/mobile-secret-manager-mvp.md`),
per [ADR-0005](../docs/adr/0005-client-platform-flutter-mobile-nextjs-web.md).
No UI or business-logic source is shared with [`web/`](../web/README.md);
each platform implements the same crypto/wire contract independently.

## Stories implemented

| ID | Title | Notes |
|---|---|---|
| MSM-2 | Shared crypto/vault core library | `lib/src/core/crypto/crypto_core.dart` (Dart realization; independent of web's TS implementation) |
| MSM-3 | Mobile secure-storage and biometric-gating adapter | `lib/src/core/storage/secure_store.dart` (`flutter_secure_storage`) + `local_auth`-gated DEK cache restore in `vault_repository.dart` |
| MSM-4 | Onboarding: create vault and master password | `lib/src/ui/screens/vault_setup_screen.dart` |
| MSM-5 | Vault unlock (master password + optional biometric) | `lib/src/ui/screens/vault_unlock_screen.dart` |
| MSM-6 | Vault list and view/copy a secret | `lib/src/ui/screens/vault_list_screen.dart`, `secret_detail_screen.dart` |
| MSM-7 | Create/edit/delete a secret | `lib/src/ui/screens/secret_edit_screen.dart` |
| MSM-8 | Recovery Kit generation and display at onboarding | `vault_setup_screen.dart` + `VaultRepository.recoveryKitPendingAck` |
| MSM-9 | Vault recovery via Recovery Kit | `lib/src/ui/screens/recovery_screen.dart` |
| MSM-14 | Sync integration: offline queue, pending indicator | `lib/src/core/sync/offline_queue.dart` + `VaultRepository._drainQueue` |
| MSM-15 | Conflict resolution UI (409, side-by-side) | `lib/src/ui/widgets/conflict_dialog.dart` |

Deep links (`issuegatevault://vault/...` and a universal-link form) are
validated in `lib/src/core/deeplink/deep_link_router.dart` — unknown
scheme/host/path/item-id input is rejected rather than best-effort routed.

**Not implemented / explicitly out of scope** (per the agent's scope and the
plan's discipline split): MSM-16/17/18/19 (CI, backend hosting, app-store
signing/distribution, observability) are infrastructure-discipline stories,
not mobile. Argon2id KDF (MSM-2 AC1's long-term default) is not implemented;
this client uses the same documented PBKDF2-SHA256 fallback as the web
client, by design, to stay cross-decryptable for a shared account (see
"Crypto/wire-contract parity" below). Dart models are hand-maintained
against the backend's types rather than generated from an OpenAPI/JSON
Schema source (ADR-0005 item 4's generation pipeline is a tracked follow-up).

## Setup

**This directory ships only the `lib/`/`test/`/`pubspec.yaml` Dart sources —
it does not yet contain the native `android/`/`ios/` runner projects that
`flutter create` normally scaffolds**, because `flutter create` could not be
run in the authoring sandbox (no Flutter SDK available there; see
"Validation honesty" below). Before this app can actually build and run,
first scaffold the native projects in place:

```
cd mobile
flutter create --project-name issue_gate_mobile --org <your.reverse.domain> .
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:4000
```

`flutter create .` will not overwrite `lib/`, `test/`, or `pubspec.yaml`
(it detects the existing project and only adds the missing platform
folders); review its diff afterwards all the same. Add the custom-scheme
(`issuegatevault://`) and universal-link intent filters/associated-domains
required by `lib/src/core/deeplink/deep_link_router.dart` to the generated
`android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist` —
these are not included in this pass.

`API_BASE_URL` defaults to `http://localhost:4000` (the backend's local dev
port, see `../backend/.env.example`) if not supplied; point it at a running
`backend/` instance (see `../backend/README.md`) or a deployed environment.

Register an account, create a vault (a master password separate from the
account password), then add/view/edit/delete secrets. Secrets written while
offline queue locally and sync automatically once connectivity returns.

## Crypto/wire-contract parity with `web/`

Both clients must be able to decrypt each other's items for a single
account used across devices. `crypto_core.dart` therefore intentionally
matches `web/src/lib/crypto.ts`'s algorithm choices and byte layout exactly:

- KDF: PBKDF2-HMAC-SHA256, 310,000 iterations, 256-bit output.
- Cipher: AES-256-GCM, 12-byte nonce, ciphertext and 16-byte auth tag
  concatenated before base64 encoding (matching Web Crypto's
  `subtle.encrypt`/`wrapKey` output layout).
- DEK wrapping: the DEK's raw bytes are AES-GCM-encrypted directly under the
  wrapping key (master-key-derived or recovery-key-derived), matching
  `subtle.wrapKey`/`unwrapKey`'s semantics.

This is verified only by inspection here (ADR-0005's shared cross-language
test-vector suite is a tracked follow-up, not yet wired into either client's
test suite).

## Tests

```
flutter test
```

Covers (all pure-Dart, no widget/integration tests in this pass):

- `test/crypto_core_test.dart` — KDF determinism, wrap/unwrap and
  encrypt/decrypt round-trips, and fail-closed behavior on a wrong key or
  tampered ciphertext.
- `test/offline_queue_test.dart` — FIFO ordering, idempotent re-queue
  (replace-in-place, no duplicate replay), and capped exponential backoff.
- `test/deep_link_router_test.dart` — valid routes accepted; unknown
  scheme/host/path and malformed/path-traversal/injection item ids rejected.

**Validation honesty**: this change was authored in a sandbox without the
Flutter SDK, a simulator, or a device, so none of the following could
actually be executed here: `flutter create`, `flutter pub get`,
`flutter test`, `flutter analyze`, or `flutter run`. All Dart source was
written and cross-checked by inspection against the `cryptography`, `http`,
`flutter_secure_storage`, `connectivity_plus`, `local_auth`, `provider`, and
`uuid` package APIs as best-known, but **has not been compiled or run**.
Before relying on this code:

0. Scaffold the native projects as described above (`flutter create .`);
   this repo currently has no `android/`/`ios/` folders.
1. Run `flutter pub get`, `flutter analyze`, and `flutter test` and fix any
   compile errors, dependency-resolution failures, or analyzer warnings.
2. Run the app on an iOS Simulator/device and an Android
   emulator/device across at least two OS versions each.
3. Platform-integration-test separately (cannot be done via unit tests):
   biometric enrollment/denial/lockout on real hardware, Keychain/Keystore
   behavior across app reinstall and OS backup/restore, deep-link
   registration (manifest/`Info.plist` entries from step 0), backgrounding/
   process-death mid-unlock, and offline→online transitions on a real
   network (airplane mode toggles, not just `connectivity_plus` state).
4. Exercise the offline queue across a real app restart: by design (see
   `offline_queue.dart`'s doc comment) it is in-memory only and is lost on
   process death — decide if that's acceptable for MVP or needs a follow-up
   to persist it (encrypted) to disk.
