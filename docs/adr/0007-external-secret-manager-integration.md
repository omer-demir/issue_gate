# ADR-0007: Integrating external secret managers via client-side import

Status: Proposed

## Context

Users want to connect secrets they already hold in other managers (Bitwarden,
1Password, KeePass/KDBX, LastPass, and developer stores such as HashiCorp Vault
or AWS/Azure/GCP secret managers).

Current state:
- The backend is zero-knowledge. `ItemRecord` (`backend/src/types.ts:34-47`) holds
  only an opaque envelope (`ciphertext`, `nonce`, `algo`, `kdfParams`,
  `schemaVersion`, `revision`, `changeSeq`, `deletedAt`) plus `ownerId`
  (ADR-0001, ADR-0003).
- Items sync through `backend/src/routes/items.ts` (GET/PUT/DELETE behind
  `authenticate`).
- Plaintext must not exist in the Next.js server code (ADR-0005). Logs must be
  redacted (ADR-0001).
- Shared client logic lives in the shared core (ADR-0002).
- Bitwarden/Vaultwarden compatibility was rejected for MVP and kept as a
  fallback (ADR-0003).
- No import or integration code exists.

Constraint: any option must keep the server unable to read plaintext or
third-party credentials.

Assumptions (to confirm): personal use, not team sharing; password managers
first; developer-secret stores later; one-time import is acceptable for v1.
No external docs were verified (no web access); provider formats must be
checked at implementation time.

## Decision

Adopt **client-side import through a provider adapter interface** in the shared
core, with no backend change for v1. Live connectors are a separate, later
decision (revisit triggers below). Server-side connectors are rejected.

1. Parsers run on the device. Each reads a provider export file (Bitwarden JSON,
   1Password 1PUX/CSV, KDBX, LastPass CSV) and produces normalized items.
2. The client encrypts each item with the vault key and uploads it through the
   existing `PUT` items API. The server sees no new data.
3. Imported plaintext stays in memory. It is never written to disk by the app,
   never logged, and the user is told to delete the export file.
4. Idempotency: the client derives a deterministic `itemId` from
   (provider, source id) using a keyed hash (HMAC with a vault-derived key), so
   re-import updates instead of duplicating. Source metadata lives inside the
   encrypted payload, so `ItemRecord` stays opaque.
5. Unmapped fields (attachments, TOTP, custom fields) are kept as generic
   encrypted fields or reported as skipped. Never silently dropped.

## Alternatives considered

| Option | Zero-knowledge | Live sync | Backend change | Complexity | Verdict |
|---|---|---|---|---|---|
| A. Client-side file import (chosen) | Kept | No | None | Low | Chosen for v1 |
| B. Client-side live connectors (provider APIs/tokens stored as encrypted items) | Kept | Yes | None initially | High: CORS in web, token storage, conflicts, revocation | Defer; per-provider ADR |
| C. Server-side connectors | Broken (server holds provider creds/plaintext) | Yes | Large | High | Rejected |
| D. Bitwarden-compatible backend (ADR-0003 fallback) | Provider-defined | Yes | Replace backend | High | Not now |

## Consequences

Positive:
- No backend, API, or schema change. Fully reversible; it is additive client code.
- Zero-knowledge model and tenancy (`ownerId`) unchanged.
- Adapter interface lets providers be added independently.

Negative:
- One-time copy, so changes in the source manager do not propagate.
- Users handle a plaintext export file, which is a real exposure window.
- Field-mapping loss is possible for exotic item types.

## Risks and mitigations

- Plaintext export left on disk: warn, offer "delete file after import" where the
  platform permits, and keep data in memory only.
- Malformed or hostile files: size limits, streaming or bounded parsing, no
  eval, and schema validation. Zip and XML parsers must disable external
  entities and bound decompression.
- Secrets leaking to logs or crash reports: log only counts and error codes.
- Duplicate or conflicting items: deterministic ids and a preview step with
  create/update/skip counts.
- Provider format drift: versioned parsers with fixture tests.

## Migration, rollout, and rollback

- Ship behind a client feature flag, first Bitwarden JSON, then KDBX, then others.
- No data migration. Rollback: remove the flag. Imported items are ordinary items
  and can be deleted by the user. Tag an import batch inside the payload so a
  whole batch can be undone client-side.

## Validation

- Unit tests per parser against synthetic fixtures (no real secrets).
- Test: re-importing the same file yields zero new items.
- Test: no import code path writes plaintext to storage or logs; the backend
  receives only envelope fields.
- Test: ciphertext round-trips through the existing items API unchanged.
- Metrics (client, bounded cardinality, no content): import count by provider,
  skipped-field count, failure code.

## Interface sketch (shared core, TypeScript-like)

```ts
interface ImportAdapter {
  id: "bitwarden-json" | "kdbx" | "1pux" | "lastpass-csv";
  parse(input: Uint8Array, opts?: { password?: string }): AsyncIterable<NormalizedItem | ImportWarning>;
}
interface NormalizedItem {
  sourceId: string;           // stable id in the source manager
  kind: "login" | "note" | "card" | "other";
  title: string;
  fields: Record<string, string>;
  folder?: string;
  skipped?: string[];         // names of unmapped fields
}
```

Errors: `UNSUPPORTED_FORMAT`, `BAD_PASSWORD`, `FILE_TOO_LARGE`, `PARSE_ERROR`. None
include file content. A failed item never aborts the batch. It is reported in the
preview and summary.

## Revisit triggers

- Users need continuous sync, which requires a per-provider live connector ADR
  (B). It must cover token storage, CORS or native-only execution, and
  revocation.
- Multi-user or team sharing (ADR-0001 re-evaluation trigger).
- Import volume or demand justifies a Bitwarden-compatible backend (D).

## Open questions

- Which providers first, and is import enough?
- Personal use only, or team secrets?
- Are developer stores (Vault, AWS) in scope?
- Does the client item schema need first-class `source` metadata (currently
  placed inside the encrypted payload)?
