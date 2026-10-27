# Mobile client

Flutter/Dart client for iOS and Android. Provider manages state; `http` connects to the API; `cryptography` implements client-side vault encryption; `flutter_secure_storage` stores session/cache values; `local_auth` provides biometric prompts; `connectivity_plus` signals network changes.

The [web client](../web/README.md) is implemented separately. Both clients must preserve the same [crypto and sync format](../docs/design/mobile-secret-manager-technical-design.md), but a shared cross-language test-vector suite is not yet present.

## Setup

Start with iOS: install Flutter, Xcode and its command-line tools, and CocoaPods on macOS. The [devcontainer](../.devcontainer/README.md) supplies Flutter 3.35.7 for Dart editing, analysis, and tests, without an Android SDK. Use the same Flutter version on the Mac. iOS builds and Simulator/device runs must run on macOS outside the Linux container. `pubspec.yaml` declares Dart `>=3.3.0 <4.0.0` and Flutter `>=3.19.0`; package dependencies may require newer SDKs than those lower bounds. Android tooling is optional and can be installed separately when needed.

**Native runners are not included:** this directory contains Dart sources, tests, and package configuration, but no `android/` or `ios/` projects. From `mobile/` in a macOS host terminal, generate only the missing iOS runner:

```sh
flutter doctor
flutter create --platforms=ios --project-name issue_gate_mobile --org com.example .
git diff -- .
git status --short
flutter pub get
```

Replace `com.example` with your organization's reverse-domain identifier before generating a real app. Review generated and modified files: do not assume scaffolding leaves `lib/`, `test/`, or `pubspec.yaml` untouched, and preserve the existing application code and tests. Resolve Xcode/CocoaPods issues reported by `flutter doctor`; missing Android tooling is expected for iOS-only development.

Start the backend on port 4000 using the [root quick start](../README.md#run-locally), then run on the Mac for an iOS Simulator:

```sh
open -a Simulator
flutter run --dart-define=API_BASE_URL=http://localhost:4000/v1
```

When the backend runs in the devcontainer, keep VS Code's port 4000 forwarding active. Run `flutter pub get` when switching between container and host because generated Dart/plugin metadata contains environment-specific paths; avoid concurrent Flutter commands in the shared checkout. Later, Android development requires its SDK/emulator and a runner generated with `flutter create --platforms=android --project-name issue_gate_mobile --org com.example .`, with the same review of generated changes.

## Configuration

`API_BASE_URL` is a compile-time Dart define. The client appends paths such as `/auth/login`; include **`/v1` without a trailing slash**. Rebuild/relaunch after changing it; Flutter does not read either root `.env` or `web/.env.local`.

| Target | Base URL with API on host port 4000 |
|---|---|
| iOS Simulator | `http://localhost:4000/v1` |
| Android emulator | `http://10.0.2.2:4000/v1` |
| Physical device | `http://<development-host-LAN-IP>:4000/v1`, on a trusted reachable network |
| Hosted API | `https://<api-domain>/v1` |

The source fallback is `http://localhost:4000` (missing `/v1`), so always supply the define. On Android, `localhost` refers to the emulator/device, not the development host. No `backend/.env.example` exists; backend settings are documented in the [backend guide](../backend/README.md#configuration).

For local HTTP, configure development-only Android cleartext/network-security and iOS transport-security permissions as needed. Do not carry broad HTTP exceptions into release builds; use HTTPS outside local development. Physical-device access also requires the host firewall to allow the API port and, when using the devcontainer, forwarding that is reachable from the device rather than localhost-only forwarding. Native HTTP is not subject to browser CORS and does not need the local web proxy.

## Native integration

After scaffolding, review the platform requirements of `flutter_secure_storage` and `local_auth`, including Android activity/manifest configuration and iOS usage descriptions/entitlements. The Dart secure-store adapter is not evidence of hardware-enforced per-read biometric protection: it stores base64 raw DEK bytes using secure storage, while the unlock screen performs the biometric prompt separately.

`lib/src/core/deeplink/deep_link_router.dart` validates custom-scheme links such as `issuegatevault://vault/item/<itemId>` and HTTPS links on the placeholder allowlisted host `app.issuegatevault.example`. A parser alone does not register OS links. Before enabling links, configure Android intent filters/app-link association and iOS URL schemes/associated domains, replace the placeholder host, and wire incoming platform links into authenticated navigation. Verify cold-start and already-running cases without bypassing vault unlock.

## Development

From `mobile/` after `flutter pub get`:

```sh
flutter analyze
flutter test
```

| Path | Responsibility |
|---|---|
| `lib/main.dart`, `lib/src/app.dart` | Dependency wiring, session restore, navigation |
| `lib/src/core/api/` | HTTP client and hand-maintained wire models |
| `lib/src/core/crypto/` | PBKDF2, AES-GCM, wrapping and recovery |
| `lib/src/core/storage/` | OS secure-storage adapter |
| `lib/src/core/vault/`, `lib/src/core/sync/` | Vault state, pending operations, sync |
| `lib/src/ui/` | Screens and conflict UI |
| `test/` | Crypto round-trips/tamper rejection, queue behavior, link parsing |

After native integration, `flutter build apk` builds Android; `flutter build ios --no-codesign` builds an unsigned iOS app on macOS. Supply the intended `--dart-define=API_BASE_URL=.../v1` to build commands too. Signing, store distribution, and CI are not configured here.

## Limitations and device review

The item cache and offline queue are in memory, not a persistent offline vault. Process death loses queued work. Network-state callbacks do not prove that the API is reachable. The implemented KDF is PBKDF2-SHA256, not the planned Argon2id.

Native builds and device behavior remain unverified prerequisites, not guarantees from the Dart tests. Before using anything beyond disposable test data, run the analyzer/tests, build both targets, and review:

- Biometric enrollment, denial, lockout, fallback, and secure-storage access on real hardware.
- Keychain/Keystore behavior across reinstall and OS backup/restore; lock/logout cache handling.
- Backgrounding and process termination during unlock or pending edits, including unsynced-data loss.
- Real offline/reconnect transitions, two-device conflicts, expiry of account sessions, and clipboard clearing.
- Deep-link registration and authenticated routing on each platform.

Use the [UX reference](../docs/design/mobile-secret-manager-design-handoff.md) for account-login versus vault-unlock behavior and the [architecture guide](../docs/design/mobile-secret-manager-architecture.md#current-limitations) for shared limitations.
