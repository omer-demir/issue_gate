/**
 * MSM-2 (web realization, per ADR-0005): client-side-only zero-knowledge
 * crypto core. Nothing here ever transmits plaintext or raw key material —
 * callers only ever send `ciphertext`/`nonce`/`salt`/`kdfParams` over the
 * wire (see ../lib/api.ts).
 *
 * KDF: PBKDF2-SHA256 (Argon2id is the long-term default per MSM-2 AC1; the
 * Web Crypto API has no native Argon2id, so this web client ships the
 * documented PBKDF2-SHA256 fallback only. Adding Argon2id requires a vetted
 * WASM dependency and is tracked as a follow-up, see README).
 * Cipher: AES-256-GCM (authenticated; tamper/wrong-key attempts fail closed).
 */

export const PBKDF2_ITERATIONS = 310_000;
export const KDF_PARAMS_VERSION = 1;

export interface KdfParams {
  algo: string;
  iterations: number;
}

export interface WrappedKey {
  /** base64 ciphertext of the wrapped (encrypted) key. */
  wrapped: string;
  /** base64 AES-GCM nonce used for the wrap operation. */
  nonce: string;
}

export interface Envelope {
  /** base64 AES-256-GCM ciphertext (includes the auth tag). */
  ciphertext: string;
  /** base64 AES-GCM nonce. */
  nonce: string;
  algo: "AES-256-GCM";
  schemaVersion: number;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is unavailable in this environment");
  }
  return subtle;
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// DOM lib (Uint8Array<ArrayBuffer>) and @types/node's lib.dom override
// (Uint8Array<ArrayBufferLike>) disagree on BufferSource's generic; this
// narrow cast point keeps the public API ergonomic (plain Uint8Array) without
// spreading `as BufferSource` through every Web Crypto call site below.
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function generateSaltB64(): string {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return toBase64(salt);
}

/** High-entropy Recovery Kit key (MSM-8), formatted for manual transcription. */
export function generateRecoveryKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  const b32 = toBase64(bytes).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 32);
  return (b32.match(/.{1,4}/g) ?? [b32]).join("-");
}

async function deriveBitsKey(secret: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    "raw",
    asBufferSource(new TextEncoder().encode(secret)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: asBufferSource(fromBase64(saltB64)), iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );
}

/** Derives the master key from the master password + per-vault salt (never sent to the backend). */
export async function deriveMasterKey(
  masterPassword: string,
  saltB64: string,
  kdfParams: KdfParams = { algo: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS }
): Promise<CryptoKey> {
  return deriveBitsKey(masterPassword, saltB64, kdfParams.iterations);
}

/** Derives the recovery-wrap key from the Recovery Kit key + its own salt. */
export async function deriveRecoveryKey(recoveryKey: string, saltB64: string): Promise<CryptoKey> {
  return deriveBitsKey(recoveryKey, saltB64, PBKDF2_ITERATIONS);
}

export async function generateDek(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapDek(dek: CryptoKey, wrappingKey: CryptoKey): Promise<WrappedKey> {
  const subtle = getSubtle();
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey("raw", dek, wrappingKey, { name: "AES-GCM", iv: asBufferSource(nonce) });
  return { wrapped: toBase64(wrapped), nonce: toBase64(nonce) };
}

/**
 * Unwraps a DEK. On a wrong wrapping key (e.g. incorrect master password) or
 * tampered ciphertext, AES-GCM's auth-tag check rejects it: this rejects
 * (fails closed) rather than returning garbage key material (MSM-2 AC3).
 */
export async function unwrapDek(wrapped: WrappedKey, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.unwrapKey(
    "raw",
    asBufferSource(fromBase64(wrapped.wrapped)),
    wrappingKey,
    { name: "AES-GCM", iv: asBufferSource(fromBase64(wrapped.nonce)) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson(value: unknown, dek: CryptoKey, schemaVersion = 1): Promise<Envelope> {
  const subtle = getSubtle();
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(nonce) }, dek, asBufferSource(plaintext));
  return { ciphertext: toBase64(ciphertext), nonce: toBase64(nonce), algo: "AES-256-GCM", schemaVersion };
}

/** Throws (never returns partial/garbage data) if the tag check fails. */
export async function decryptJson<T>(envelope: Pick<Envelope, "ciphertext" | "nonce">, dek: CryptoKey): Promise<T> {
  const subtle = getSubtle();
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(fromBase64(envelope.nonce)) },
    dek,
    asBufferSource(fromBase64(envelope.ciphertext))
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
