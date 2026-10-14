import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import '../api/models.dart';

/// MSM-2 (mobile realization, per ADR-0005): client-side-only zero-knowledge
/// crypto core. Nothing here ever transmits plaintext or raw key material —
/// callers only ever send `ciphertext`/`nonce`/`salt`/`kdfParams` over the
/// wire (see ../api/api_client.dart).
///
/// KDF: PBKDF2-HMAC-SHA256 (Argon2id is the long-term default per MSM-2 AC1;
/// kept as PBKDF2 here to match the web client's documented fallback and to
/// preserve cross-device decrypt compatibility for a shared account — see
/// ADR-0005's cross-language test-vector note). Cipher: AES-256-GCM
/// (authenticated; tamper/wrong-key attempts fail closed via
/// `SecretBoxAuthenticationError`). Output encoding (ciphertext||tag,
/// base64) matches the Web Crypto `subtle.encrypt`/`wrapKey` layout so items
/// written by one platform decrypt correctly on the other.
const int pbkdf2Iterations = 310000;
const int kdfParamsVersion = 1;
const int _aesGcmTagLengthBytes = 16;
const int _aesGcmNonceLengthBytes = 12;

final _secureRandom = Random.secure();
final _aesGcm = AesGcm.with256bits();

String toBase64(List<int> bytes) => base64Encode(bytes);

Uint8List fromBase64(String value) => base64Decode(value);

Uint8List _randomBytes(int length) {
  final bytes = Uint8List(length);
  for (var i = 0; i < length; i++) {
    bytes[i] = _secureRandom.nextInt(256);
  }
  return bytes;
}

String generateSaltB64() => toBase64(_randomBytes(16));

/// High-entropy Recovery Kit key (MSM-8), formatted for manual transcription.
String generateRecoveryKey() {
  final bytes = _randomBytes(20);
  final alnum = toBase64(bytes).replaceAll(RegExp('[^A-Za-z0-9]'), '').toUpperCase();
  final b32 = alnum.length >= 32 ? alnum.substring(0, 32) : alnum.padRight(32, '0');
  final groups = <String>[];
  for (var i = 0; i < b32.length; i += 4) {
    groups.add(b32.substring(i, min(i + 4, b32.length)));
  }
  return groups.join('-');
}

Future<SecretKey> _deriveBitsKey(String secret, String saltB64, int iterations) async {
  final pbkdf2 = Pbkdf2(macAlgorithm: Hmac.sha256(), iterations: iterations, bits: 256);
  return pbkdf2.deriveKeyFromPassword(password: secret, nonce: fromBase64(saltB64));
}

/// Derives the master key from the master password + per-vault salt (never sent to the backend).
Future<SecretKey> deriveMasterKey(String masterPassword, String saltB64, KdfParams kdfParams) =>
    _deriveBitsKey(masterPassword, saltB64, kdfParams.iterations);

/// Derives the recovery-wrap key from the Recovery Kit key + its own salt.
Future<SecretKey> deriveRecoveryKey(String recoveryKey, String saltB64) =>
    _deriveBitsKey(recoveryKey, saltB64, pbkdf2Iterations);

Future<SecretKey> generateDek() => _aesGcm.newSecretKey();

Uint8List _concatCiphertextAndMac(List<int> cipherText, Mac mac) =>
    Uint8List.fromList([...cipherText, ...mac.bytes]);

(Uint8List cipherText, Mac mac) _splitCiphertextAndMac(Uint8List combined) {
  final split = combined.length - _aesGcmTagLengthBytes;
  return (combined.sublist(0, split), Mac(combined.sublist(split)));
}

Future<WrappedKey> wrapDek(SecretKey dek, SecretKey wrappingKey) async {
  final nonce = _randomBytes(_aesGcmNonceLengthBytes);
  final dekBytes = await dek.extractBytes();
  final box = await _aesGcm.encrypt(dekBytes, secretKey: wrappingKey, nonce: nonce);
  return WrappedKey(wrapped: toBase64(_concatCiphertextAndMac(box.cipherText, box.mac)), nonce: toBase64(nonce));
}

/// Unwraps a DEK. On a wrong wrapping key (e.g. incorrect master password) or
/// tampered ciphertext, AES-GCM's auth-tag check rejects it: this throws
/// `SecretBoxAuthenticationError` (fails closed) rather than returning
/// garbage key material (MSM-2 AC3).
Future<SecretKey> unwrapDek(WrappedKey wrapped, SecretKey wrappingKey) async {
  final (cipherText, mac) = _splitCiphertextAndMac(fromBase64(wrapped.wrapped));
  final box = SecretBox(cipherText, nonce: fromBase64(wrapped.nonce), mac: mac);
  final clear = await _aesGcm.decrypt(box, secretKey: wrappingKey);
  return SecretKeyData(clear);
}

/// Wraps a raw key's bytes into a [SecretKey] (e.g. restoring the DEK from
/// the biometric-gated secure-storage cache — see
/// core/vault/vault_repository.dart's `tryBiometricUnlock`).
SecretKey secretKeyFromBytes(List<int> bytes) => SecretKeyData(bytes);

class Envelope {
  const Envelope({required this.ciphertext, required this.nonce, required this.algo, required this.schemaVersion});

  final String ciphertext;
  final String nonce;
  final String algo;
  final int schemaVersion;
}

Future<Envelope> encryptJson(Object? value, SecretKey dek, {int schemaVersion = 1}) async {
  final nonce = _randomBytes(_aesGcmNonceLengthBytes);
  final plaintext = utf8.encode(jsonEncode(value));
  final box = await _aesGcm.encrypt(plaintext, secretKey: dek, nonce: nonce);
  return Envelope(
    ciphertext: toBase64(_concatCiphertextAndMac(box.cipherText, box.mac)),
    nonce: toBase64(nonce),
    algo: 'AES-256-GCM',
    schemaVersion: schemaVersion,
  );
}

/// Throws (never returns partial/garbage data) if the tag check fails.
Future<dynamic> decryptJson(String ciphertextB64, String nonceB64, SecretKey dek) async {
  final (cipherText, mac) = _splitCiphertextAndMac(fromBase64(ciphertextB64));
  final box = SecretBox(cipherText, nonce: fromBase64(nonceB64), mac: mac);
  final clear = await _aesGcm.decrypt(box, secretKey: dek);
  return jsonDecode(utf8.decode(clear));
}
