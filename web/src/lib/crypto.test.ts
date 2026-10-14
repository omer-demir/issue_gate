import { describe, expect, it } from "vitest";
import {
  decryptJson,
  deriveMasterKey,
  deriveRecoveryKey,
  encryptJson,
  fromBase64,
  generateDek,
  generateRecoveryKey,
  generateSaltB64,
  toBase64,
  unwrapDek,
  wrapDek,
} from "./crypto";

describe("crypto core (MSM-2 web realization)", () => {
  it("round-trips base64 encoding", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("derives the same master key for the same password+salt, different for a different password", async () => {
    const salt = generateSaltB64();
    const keyA = await deriveMasterKey("correct horse battery staple", salt);
    const keyB = await deriveMasterKey("correct horse battery staple", salt);
    const keyC = await deriveMasterKey("wrong password", salt);

    const dek = await generateDek();
    const wrappedA = await wrapDek(dek, keyA);
    // Same password+salt unwraps successfully (AC1: deterministic re-derivation).
    await expect(unwrapDek(wrappedA, keyB)).resolves.toBeTruthy();
    // Wrong password derives a different key; unwrap must fail closed (AC3).
    await expect(unwrapDek(wrappedA, keyC)).rejects.toThrow();
  });

  it("encrypts/decrypts a secret item round-trip with no plaintext leakage on tamper (AC2/AC3)", async () => {
    const dek = await generateDek();
    const secret = { title: "Email", username: "alice@example.com", password: "s3cr3t!" };
    const envelope = await encryptJson(secret, dek);

    expect(envelope.algo).toBe("AES-256-GCM");
    expect(envelope.ciphertext).not.toContain("s3cr3t");

    const decrypted = await decryptJson<typeof secret>(envelope, dek);
    expect(decrypted).toEqual(secret);

    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "AAAA" };
    await expect(decryptJson(tampered, dek)).rejects.toThrow();
  });

  it("rotates the master password by only re-wrapping the DEK, not re-encrypting items (AC4)", async () => {
    const salt = generateSaltB64();
    const dek = await generateDek();
    const secret = { title: "Bank", password: "hunter2" };
    const envelope = await encryptJson(secret, dek);

    const oldMasterKey = await deriveMasterKey("old-password", salt);
    const wrappedOld = await wrapDek(dek, oldMasterKey);

    const newMasterKey = await deriveMasterKey("new-password", salt);
    const recoveredDek = await unwrapDek(wrappedOld, oldMasterKey);
    const wrappedNew = await wrapDek(recoveredDek, newMasterKey);

    const dekFromNewWrap = await unwrapDek(wrappedNew, newMasterKey);
    const decrypted = await decryptJson<typeof secret>(envelope, dekFromNewWrap);
    expect(decrypted).toEqual(secret);
  });

  it("recovers the DEK via the Recovery Kit key independently of the master password (MSM-8/9)", async () => {
    const recoveryKey = generateRecoveryKey();
    expect(recoveryKey).toMatch(/^[A-Z0-9-]+$/);

    const recoverySalt = generateSaltB64();
    const dek = await generateDek();
    const recoveryWrapKey = await deriveRecoveryKey(recoveryKey, recoverySalt);
    const wrappedByRecovery = await wrapDek(dek, recoveryWrapKey);

    const recoveredWrapKey = await deriveRecoveryKey(recoveryKey, recoverySalt);
    const recoveredDek = await unwrapDek(wrappedByRecovery, recoveredWrapKey);

    const secret = { title: "Recovered item" };
    const envelope = await encryptJson(secret, dek);
    await expect(decryptJson(envelope, recoveredDek)).resolves.toEqual(secret);

    const wrongWrapKey = await deriveRecoveryKey("WRONG-RECOVERY-KEY", recoverySalt);
    await expect(unwrapDek(wrappedByRecovery, wrongWrapKey)).rejects.toThrow();
  });
});
