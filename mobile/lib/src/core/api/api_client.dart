import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Thrown for any non-2xx response or network failure. `status == 0` marks
/// a network-layer failure (offline/DNS/TLS/timeout) so callers can tell it
/// apart from a server-returned error (mirrors web/src/lib/api.ts's ApiError).
class ApiException implements Exception {
  ApiException(this.error, this.status, this.body);

  final String error;
  final int status;
  final Object? body;

  @override
  String toString() => 'ApiException($status, $error)';
}

/// Thin REST client for the backend's auth/vault/items API (ADR-0003/0006).
/// Holds no session state itself — callers pass the access token per call —
/// so it stays easily fakeable in tests.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? httpClient}) : _client = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Future<dynamic> _send(
    String path, {
    required String method,
    Map<String, String>? headers,
    Object? body,
  }) async {
    http.Response response;
    try {
      final request = http.Request(method, Uri.parse('$baseUrl$path'));
      request.headers['Content-Type'] = 'application/json';
      if (headers != null) request.headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      final streamed = await _client.send(request).timeout(const Duration(seconds: 20));
      response = await http.Response.fromStream(streamed);
    } catch (cause) {
      // Network failure (offline, DNS, TLS, timeout) — never silently swallowed.
      throw ApiException('network_error', 0, cause.toString());
    }

    final text = response.body;
    final decoded = text.isNotEmpty ? jsonDecode(text) : null;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = (decoded is Map && decoded['error'] is String) ? decoded['error'] as String : 'request_failed';
      throw ApiException(error, response.statusCode, decoded);
    }
    return decoded;
  }

  Map<String, String> _auth(String accessToken) => {'Authorization': 'Bearer $accessToken'};

  // --- auth (MSM-10) ---
  Future<String> register(String email, String password) async {
    final json = await _send('/auth/register', method: 'POST', body: {'email': email, 'password': password});
    return json['userId'] as String;
  }

  Future<TokenPair> login(String email, String password) async {
    final json = await _send('/auth/login', method: 'POST', body: {'email': email, 'password': password});
    return TokenPair.fromJson(json as Map<String, dynamic>);
  }

  Future<TokenPair> refresh(String refreshToken) async {
    final json = await _send('/auth/refresh', method: 'POST', body: {'refreshToken': refreshToken});
    return TokenPair.fromJson(json as Map<String, dynamic>);
  }

  Future<void> logout(String refreshToken) =>
      _send('/auth/logout', method: 'POST', body: {'refreshToken': refreshToken});

  // --- vault bootstrap (MSM-11) ---
  Future<VaultBootstrap> vaultSetup(
    String accessToken, {
    required String salt,
    required KdfParams kdfParams,
    required int kdfParamsVersion,
  }) async {
    final json = await _send(
      '/vault/kdf',
      method: 'POST',
      headers: _auth(accessToken),
      body: {'salt': salt, 'kdfParams': kdfParams.toJson(), 'kdfParamsVersion': kdfParamsVersion},
    );
    return VaultBootstrap.fromJson({...json as Map<String, dynamic>, 'provisioned': true});
  }

  Future<VaultBootstrap> vaultBootstrap(String accessToken) async {
    final json = await _send('/vault/kdf', method: 'GET', headers: _auth(accessToken));
    return VaultBootstrap.fromJson(json as Map<String, dynamic>);
  }

  // --- items (MSM-12/MSM-13) ---
  Future<ItemRecord> getItem(String accessToken, String itemId) async {
    final json = await _send('/items/${Uri.encodeComponent(itemId)}', method: 'GET', headers: _auth(accessToken));
    return ItemRecord.fromJson(json as Map<String, dynamic>);
  }

  Future<ItemRecord> upsertItem(
    String accessToken,
    String itemId, {
    required int expectedRevision,
    required String ciphertext,
    required String nonce,
    required String algo,
    required int schemaVersion,
    Map<String, dynamic>? kdfParams,
  }) async {
    final json = await _send(
      '/items/${Uri.encodeComponent(itemId)}',
      method: 'PUT',
      headers: _auth(accessToken),
      body: {
        'expectedRevision': expectedRevision,
        'ciphertext': ciphertext,
        'nonce': nonce,
        'algo': algo,
        'schemaVersion': schemaVersion,
        'kdfParams': kdfParams,
      },
    );
    return ItemRecord.fromJson(json as Map<String, dynamic>);
  }

  Future<ItemRecord> deleteItem(String accessToken, String itemId, int expectedRevision) async {
    final json = await _send(
      '/items/${Uri.encodeComponent(itemId)}',
      method: 'DELETE',
      headers: _auth(accessToken),
      body: {'expectedRevision': expectedRevision},
    );
    return ItemRecord.fromJson(json as Map<String, dynamic>);
  }

  Future<ChangesPage> getChanges(String accessToken, {int cursor = 0}) async {
    final json = await _send('/items?cursor=$cursor', method: 'GET', headers: _auth(accessToken));
    return ChangesPage.fromJson(json as Map<String, dynamic>);
  }
}
