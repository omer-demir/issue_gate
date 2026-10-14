import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Thin wrapper around platform-backed secure storage (iOS Keychain /
/// Android Keystore). Only ever holds auth tokens and the optional
/// biometric-gated DEK cache (MSM-3) — never the master password, and
/// never logged.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.unlocked),
            );

  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'igm.session.accessToken';
  static const _refreshTokenKey = 'igm.session.refreshToken';
  static const _emailKey = 'igm.session.email';
  static const _biometricDekKey = 'igm.vault.biometricDek';

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String email,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
      _storage.write(key: _emailKey, value: email),
    ]);
  }

  Future<({String accessToken, String refreshToken, String email})?> readSession() async {
    final values = await Future.wait([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _refreshTokenKey),
      _storage.read(key: _emailKey),
    ]);
    final accessToken = values[0];
    final refreshToken = values[1];
    final email = values[2];
    if (accessToken == null || refreshToken == null || email == null) return null;
    return (accessToken: accessToken, refreshToken: refreshToken, email: email);
  }

  Future<void> clearSession() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _emailKey),
    ]);
    await clearBiometricDek();
  }

  /// Caches the unlocked DEK (base64 raw bytes) behind platform secure
  /// storage so a later biometric prompt (MSM-3/MSM-5) can restore it
  /// without re-entering the master password. Cleared on lock/logout.
  Future<void> cacheBiometricDek(String dekB64) => _storage.write(key: _biometricDekKey, value: dekB64);

  Future<String?> readBiometricDek() => _storage.read(key: _biometricDekKey);

  Future<void> clearBiometricDek() => _storage.delete(key: _biometricDekKey);
}
