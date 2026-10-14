/// MSM-6/MSM-14 deep-link entry points (e.g. a notification or share-sheet
/// link into a specific secret). Treated as untrusted input end-to-end:
/// unknown schemes, hosts, paths, or malformed item ids are rejected safely
/// (never navigated) rather than best-effort parsed.
///
/// Note: for a custom-scheme link like `issuegatevault://vault/item/123`,
/// Dart's [Uri] parses `vault` as the *authority host*, not a path segment
/// (the `//` makes it an authority-form URI) — so the route segments below
/// are built from `host + pathSegments` for the custom scheme, but from
/// `pathSegments` alone for `https` universal links (where the host is the
/// allow-listed domain, not part of the route).
library;

const _allowedCustomScheme = 'issuegatevault';
const _allowedUniversalLinkHosts = {'app.issuegatevault.example'};
final _validItemIdPattern = RegExp(r'^[A-Za-z0-9_-]{1,128}$');

sealed class AppRoute {
  const AppRoute();
}

class VaultListRoute extends AppRoute {
  const VaultListRoute();
}

class VaultUnlockRoute extends AppRoute {
  const VaultUnlockRoute();
}

class SecretDetailRoute extends AppRoute {
  const SecretDetailRoute(this.itemId);
  final String itemId;
}

/// Returned for any input that fails scheme/host/path/parameter validation;
/// callers must never navigate on this (fail closed, no partial routing).
class UnknownRoute extends AppRoute {
  const UnknownRoute([this.reason]);
  final String? reason;
}

AppRoute parseDeepLink(Uri uri) {
  final isCustomScheme = uri.scheme == _allowedCustomScheme;
  final isUniversalLink = uri.scheme == 'https' && _allowedUniversalLinkHosts.contains(uri.host);
  if (!isCustomScheme && !isUniversalLink) {
    return const UnknownRoute('unsupported scheme/host');
  }

  final segments = isCustomScheme
      ? [uri.host, ...uri.pathSegments].where((s) => s.isNotEmpty).toList()
      : uri.pathSegments.where((s) => s.isNotEmpty).toList();

  if (segments.isEmpty || segments.first != 'vault') {
    return const UnknownRoute('unsupported path');
  }
  if (segments.length == 1) return const VaultListRoute();
  if (segments.length == 2 && segments[1] == 'unlock') return const VaultUnlockRoute();
  if (segments.length == 3 && segments[1] == 'item') {
    final itemId = segments[2];
    if (!_validItemIdPattern.hasMatch(itemId)) {
      return const UnknownRoute('invalid item id');
    }
    return SecretDetailRoute(itemId);
  }
  return const UnknownRoute('unrecognized route');
}
