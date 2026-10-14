# Web client — Mobile+Web Secret Manager MVP

Next.js (App Router) + TypeScript client implementing the MVP UI flows
against the backend sync API (`../backend`), per
[ADR-0005](../docs/adr/0005-client-platform-flutter-mobile-nextjs-web.md).
All vault cryptography (KDF, encrypt/decrypt) runs **client-side only**; the
backend never receives plaintext, master passwords, Recovery Kit keys, or
raw key material — only opaque ciphertext/salt/KDF-parameter metadata.

## Scope note: why web (not Flutter mobile) in this change

`docs/plan/mobile-secret-manager-mvp.md` sequences the MVP mobile-first with
web deferred. This change implements the **web** realization of the same
story set (MSM-4/5/6/7/8/9/14/15) because it was scoped as a web-UI
implementation task; Flutter/Dart mobile is a distinct toolchain/discipline
and is out of scope here (not applicable to a frontend/web implementation
agent — see the task's story-applicability table).

## Setup

```bash
npm install
cp .env.example .env.local   # point at your running backend/
npm run dev
```

## Scripts

- `npm run dev` / `build` / `start` — Next.js dev/build/serve.
- `npm run lint` — ESLint (`next/core-web-vitals`, `next/typescript`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` / `npm run test:watch` — Vitest + React Testing Library.

## Architecture

- `src/lib/crypto.ts` — MSM-2 web realization: PBKDF2-SHA256 KDF, AES-256-GCM
  envelope encrypt/decrypt, DEK wrap/unwrap, Recovery Kit key generation.
- `src/lib/api.ts`, `src/lib/types.ts` — typed fetch client for the backend's
  `auth`/`vault`/`items` routes.
- `src/store/SessionProvider.tsx` — account-login session (tokens only,
  `sessionStorage`; never key material).
- `src/store/VaultProvider.tsx` — unlocked vault state. The DEK lives
  **in-memory only** (a React ref) and is cleared on lock/sign-out; it is
  never persisted to `localStorage`/`sessionStorage`/IndexedDB.
- `src/app/**` — pages for register/login, vault setup (+ Recovery Kit
  display), unlock, recovery, list/view/create/edit/delete secrets.
- `src/components/**` — `FormField` (labelled + `aria-describedby` errors),
  `Banner` (`aria-live` status), `ConflictDialog` (409 side-by-side),
  `CopyButton` (clipboard clear after 30s), `PasswordStrength` (client-side
  usability guard only, not a security boundary), `SecretForm`.

### Cross-device vault key sync

The backend only stores a vault's salt/KDF params (`POST/GET /vault/kdf`),
never the wrapped DEK. To let a second device unlock the same vault without
any backend schema change (out of scope for this change), the wrapped DEK
(by master password) and the wrapped DEK (by Recovery Kit key) are stored
together as the payload of a well-known opaque item,
`itemId = "__vault_meta__"` (`algo: "vault-meta-v1"`), using the existing
items sync API exactly as any other opaque ciphertext blob. This keeps the
zero-knowledge contract intact (the backend still never inspects
`ciphertext`/`nonce`) while enabling multi-device unlock and recovery.

## Known limitations / follow-ups

- **KDF**: ships PBKDF2-SHA256 only (the documented MVP fallback). Argon2id
  (the long-term default per MSM-2 AC1) needs a vetted WASM dependency and
  is a follow-up.
- **Offline cache**: the secrets list is in-memory only per page load; an
  offline edit is queued with a "Pending sync" badge, but there is no
  IndexedDB-backed persistent offline cache yet (design handoff's full
  offline-read requirement). Online/offline detection and the pending-sync
  indicator are implemented (`useOnlineStatus`, `VaultProvider`).
- **Token refresh**: the session uses the initial access token directly; a
  401 after `expiresIn` requires signing in again rather than silently
  refreshing via `/auth/refresh`.
- **Biometric unlock (MSM-3/MSM-5 AC3)**: mobile-only by design; not
  applicable to web.
- Mobile (Flutter) implementation is not part of this change.
