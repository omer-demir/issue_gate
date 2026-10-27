# Development container

This Linux container provides Node.js 24/npm, Caddy 2, and Flutter 3.35.7 (including Dart) for the backend, web client, and mobile Dart development. It runs as the non-root `node` user. **No Android SDK, emulator, or Java toolchain is installed.** Android, Flutter web, and Linux desktop targets are disabled; Flutter unit tests do not require native runners.

## Open the repository

1. Install Docker with Linux container support (Docker Desktop on macOS) and VS Code's Dev Containers extension on your host.
2. Open a local checkout of this repository in VS Code and select **Dev Containers: Reopen in Container**. Both Intel/AMD and ARM64 hosts, including Apple Silicon, use their native architecture.
3. Wait for the image build and post-create setup. Setup runs `npm ci` for `backend/` and `web/`, copies `web/.env.example` to `web/.env.local` only if that file does not exist, and runs `flutter pub get` in `mobile/`. It does not generate native runners or start servers. Internet access is needed for image, SDK, and dependency downloads.

After changing the Dockerfile or Flutter version, select **Dev Containers: Rebuild Container**. To retry a failed dependency setup, run `bash .devcontainer/post-create.sh` from the repository root; errors stop setup rather than being ignored. Existing web configuration is preserved.

## Run the backend and web

Use three container terminals, each starting at the repository root:

```sh
PORT=4000 npm run dev --prefix backend
```

```sh
npm run dev --prefix web -- --port 3000
```

```sh
caddy run --config deploy/Caddyfile.local --adapter caddyfile
```

Open **http://localhost:8080** on the host. VS Code forwards ports 8080 (same-origin web/API entry point), 4000 (direct API), and 3000 (Next.js). Caddy's existing loopback binding works with VS Code port forwarding; no public port publication or Docker socket mount is needed. Do not use port 3000 for browser account/vault operations because the API does not enable CORS. Check the API at **http://localhost:4000/healthz**.

The container does not run the existing Docker Compose stack or require Docker inside it. The backend remains in-memory: restarting it discards data. Use disposable accounts and secrets.

## Mobile: iOS first

Use the container for editing Dart and running:

```sh
cd mobile
flutter analyze
flutter test
```

**iOS builds, Simulator runs, signing, and device deployment must run on a macOS host with Xcode, its command-line tools, and CocoaPods.** A Linux container cannot provide Xcode or run an iOS Simulator. Install Flutter **3.35.7** on that host too, then follow the [mobile setup](../mobile/README.md#setup) in a host terminal, outside the container. The repository currently has no native runners; generate only the iOS runner there and review the resulting changes.

Keep the backend running in the container. With port 4000 forwarded to your Mac, the iOS Simulator can use:

```sh
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:4000/v1
```

If VS Code chooses a different local port because 4000 is occupied, use the actual port shown in its Ports panel. A physical iPhone needs a reachable host address and deliberately configured forwarding/firewall access; the default localhost-only forwarding is not reachable from the phone. Do not expose this development API to an untrusted network.

The bind-mounted checkout is shared with the host. Flutter's generated `.dart_tool/` and plugin metadata contain platform-specific paths: rerun `flutter pub get` when switching between host and container, and avoid simultaneous Flutter commands against the same checkout. If stale build artifacts cause problems, run `flutter clean` followed by `flutter pub get` in the environment you are using. Keep host and container Flutter versions aligned.

`flutter doctor` is diagnostic, not an all-green acceptance check for this container: missing Android/platform tooling is intentional. It cannot validate iOS tooling on Linux. See the mobile guide for Keychain, biometric, and local HTTP configuration before running on a device.

## Checks

From the container repository root:

```sh
npm run typecheck --prefix backend
npm test --prefix backend
npm run typecheck --prefix web
npm run lint --prefix web
npm test --prefix web
cd mobile
flutter analyze
flutter test
```

Successful container startup should also make `node --version`, `npm --version`, `caddy version`, and `flutter --version` available without sudo. No production deployment settings are changed by this container.
