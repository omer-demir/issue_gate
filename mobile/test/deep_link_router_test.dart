import 'package:flutter_test/flutter_test.dart';
import 'package:issue_gate_mobile/src/core/deeplink/deep_link_router.dart';

void main() {
  group('parseDeepLink', () {
    test('accepts the custom-scheme vault list route', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://vault'));
      expect(route, isA<VaultListRoute>());
    });

    test('accepts the custom-scheme unlock route', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://vault/unlock'));
      expect(route, isA<VaultUnlockRoute>());
    });

    test('accepts a valid secret-detail route with a well-formed item id', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://vault/item/abc-123_XYZ'));
      expect(route, isA<SecretDetailRoute>());
      expect((route as SecretDetailRoute).itemId, 'abc-123_XYZ');
    });

    test('accepts a universal link on the allow-listed host', () {
      final route = parseDeepLink(Uri.parse('https://app.issuegatevault.example/vault'));
      expect(route, isA<VaultListRoute>());
    });

    test('rejects an unknown scheme', () {
      final route = parseDeepLink(Uri.parse('http://app.issuegatevault.example/vault'));
      expect(route, isA<UnknownRoute>());
    });

    test('rejects a universal link on an unexpected host (host-confusion attack)', () {
      final route = parseDeepLink(Uri.parse('https://evil.example/vault'));
      expect(route, isA<UnknownRoute>());
    });

    test('rejects an unrecognized path', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://settings'));
      expect(route, isA<UnknownRoute>());
    });

    test('rejects an item id with path-traversal or injection characters', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://vault/item/..%2F..%2Fetc%2Fpasswd'));
      expect(route, isA<UnknownRoute>());
    });

    test('rejects an item id containing a script-tag-like payload', () {
      final route = parseDeepLink(Uri.parse('issuegatevault://vault/item/%3Cscript%3E'));
      expect(route, isA<UnknownRoute>());
    });
  });
}
