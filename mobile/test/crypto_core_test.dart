import 'package:flutter_test/flutter_test.dart';
import 'package:issue_gate_mobile/src/core/api/models.dart';
import 'package:issue_gate_mobile/src/core/crypto/crypto_core.dart';

void main() {
  group('crypto_core', () {
    test('wrapDek/unwrapDek round-trips the DEK under a derived key', () async {
      final saltB64 = generateSaltB64();
      const kdfParams = KdfParams(algo: 'PBKDF2-SHA256', iterations: 10000);
      final masterKey = await deriveMasterKey('correct horse battery staple', saltB64, kdfParams);
      final dek = await generateDek();

      final wrapped = await wrapDek(dek, masterKey);
      final unwrapped = await unwrapDek(wrapped, masterKey);

      expect(await unwrapped.extractBytes(), await dek.extractBytes());
    });

    test('unwrapDek fails closed on a wrong wrapping key', () async {
      final saltB64 = generateSaltB64();
      const kdfParams = KdfParams(algo: 'PBKDF2-SHA256', iterations: 10000);
      final correctKey = await deriveMasterKey('correct password', saltB64, kdfParams);
      final wrongKey = await deriveMasterKey('wrong password', saltB64, kdfParams);
      final dek = await generateDek();
      final wrapped = await wrapDek(dek, correctKey);

      // The `cryptography` package's auth-tag failure (SecretBoxAuthenticationError)
      // is intentionally matched loosely here (`throwsA(anything)`) rather than by
      // exact type, since what matters for MSM-2 AC3 is that it *throws* — i.e.
      // fails closed — rather than returning garbage key material.
      await expectLater(() => unwrapDek(wrapped, wrongKey), throwsA(anything));
    });

    test('encryptJson/decryptJson round-trips arbitrary JSON', () async {
      final dek = await generateDek();
      final secret = SecretData(title: 'Email', username: 'alice@example.com', password: 's3cret!');

      final envelope = await encryptJson(secret.toJson(), dek);
      final decoded = await decryptJson(envelope.ciphertext, envelope.nonce, dek) as Map<String, dynamic>;

      expect(decoded['title'], 'Email');
      expect(decoded['username'], 'alice@example.com');
      expect(decoded['password'], 's3cret!');
    });

    test('decryptJson fails closed on tampered ciphertext', () async {
      final dek = await generateDek();
      final envelope = await encryptJson({'title': 'x'}, dek);
      final tampered = fromBase64(envelope.ciphertext);
      tampered[0] = tampered[0] ^ 0xFF;

      await expectLater(
        () => decryptJson(toBase64(tampered), envelope.nonce, dek),
        throwsA(anything),
      );
    });

    test('generateSaltB64 returns 16 random bytes, base64-encoded', () {
      final a = generateSaltB64();
      final b = generateSaltB64();
      expect(fromBase64(a), hasLength(16));
      expect(a, isNot(equals(b)));
    });

    test('generateRecoveryKey is dash-grouped and high-entropy', () {
      final a = generateRecoveryKey();
      final b = generateRecoveryKey();
      expect(RegExp(r'^[A-Z0-9]{4}(-[A-Z0-9]{4}){7}$').hasMatch(a), isTrue);
      expect(a, isNot(equals(b)));
    });

    test('deriveMasterKey is deterministic for the same password/salt/iterations', () async {
      const kdfParams = KdfParams(algo: 'PBKDF2-SHA256', iterations: 5000);
      final saltB64 = generateSaltB64();
      final key1 = await deriveMasterKey('same-password', saltB64, kdfParams);
      final key2 = await deriveMasterKey('same-password', saltB64, kdfParams);
      expect(await key1.extractBytes(), await key2.extractBytes());
    });
  });
}
