import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Account-credential hashing (MSM-10 AC1: "salted/hashed account credential
 * ... never the master password or derived vault key"). Uses Node's built-in
 * scrypt (memory-hard, no native/third-party dependency) rather than a
 * dedicated Argon2id package, since this backend never installs native
 * crypto bindings; this is an accepted MVP tradeoff — document as a
 * follow-up if a dedicated Argon2id library becomes available in the
 * deployment environment. This hashes the *account* password only; the
 * vault master password/KDF (Argon2id, client-side) is a separate concern
 * (ADR-0002/ADR-0004) this backend never sees.
 */
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const params = { N: Number(nStr), r: Number(rStr), p: Number(pStr) };
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length, params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A fixed dummy hash used to equalize timing when no account exists for a login attempt. */
export const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));
