import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/storage/secure_store.dart';
import 'core/vault/vault_repository.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/recovery_screen.dart';
import 'ui/screens/register_screen.dart';
import 'ui/screens/secret_detail_screen.dart';
import 'ui/screens/secret_edit_screen.dart';
import 'ui/screens/vault_list_screen.dart';
import 'ui/screens/vault_setup_screen.dart';
import 'ui/screens/vault_unlock_screen.dart';

/// Root widget: owns session restore/persist (MSM-5/MSM-10) and renders
/// either the auth flow or the vault flow. Deep links are resolved by
/// `ui/screens/vault_list_screen.dart`'s navigation helpers via
/// `core/deeplink/deep_link_router.dart` once authenticated.
class IssueGateApp extends StatefulWidget {
  const IssueGateApp({super.key});

  @override
  State<IssueGateApp> createState() => _IssueGateAppState();
}

class _IssueGateAppState extends State<IssueGateApp> {
  String? _accessToken;
  String? _refreshToken;
  String? _email;
  bool _restoring = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final secureStore = context.read<SecureStore>();
    final session = await secureStore.readSession();
    if (session != null) {
      _accessToken = session.accessToken;
      _refreshToken = session.refreshToken;
      _email = session.email;
      context.read<VaultRepository>().attachSession(session.accessToken);
    }
    if (mounted) setState(() => _restoring = false);
  }

  Future<void> _onAuthenticated(String accessToken, String refreshToken, String email) async {
    final secureStore = context.read<SecureStore>();
    await secureStore.saveSession(accessToken: accessToken, refreshToken: refreshToken, email: email);
    context.read<VaultRepository>().attachSession(accessToken);
    setState(() {
      _accessToken = accessToken;
      _refreshToken = refreshToken;
      _email = email;
    });
  }

  Future<void> _onLogout() async {
    final apiClient = context.read<ApiClient>();
    final secureStore = context.read<SecureStore>();
    final refreshToken = _refreshToken;
    if (refreshToken != null) {
      try {
        await apiClient.logout(refreshToken);
      } catch (_) {
        // Best-effort server-side revocation; local session is cleared regardless.
      }
    }
    await secureStore.clearSession();
    await context.read<VaultRepository>().logout();
    setState(() {
      _accessToken = null;
      _refreshToken = null;
      _email = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Issue Gate Vault',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      darkTheme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo, brightness: Brightness.dark),
      home: _restoring
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _accessToken == null
              ? LoginScreen(
                  onAuthenticated: _onAuthenticated,
                  onNavigateRegister: (context) => Navigator.of(context).push<void>(
                    MaterialPageRoute(builder: (_) => RegisterScreen(onAuthenticated: _onAuthenticated)),
                  ),
                )
              : _AuthenticatedHome(email: _email!, onLogout: _onLogout),
    );
  }
}

/// Everything behind a valid session: vault bootstrap/lock gating plus the
/// vault list/detail/edit screens.
class _AuthenticatedHome extends StatefulWidget {
  const _AuthenticatedHome({required this.email, required this.onLogout});

  final String email;
  final Future<void> Function() onLogout;

  @override
  State<_AuthenticatedHome> createState() => _AuthenticatedHomeState();
}

class _AuthenticatedHomeState extends State<_AuthenticatedHome> {
  @override
  void initState() {
    super.initState();
    context.read<VaultRepository>().checkBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VaultRepository>(
      builder: (context, vault, _) {
        switch (vault.status) {
          case VaultStatus.checking:
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          case VaultStatus.notProvisioned:
            return const VaultSetupScreen();
          case VaultStatus.locked:
            return const VaultUnlockScreen();
          case VaultStatus.unlocked:
            return Navigator(
              onGenerateRoute: (settings) {
                if (settings.name == '/new') {
                  return MaterialPageRoute(builder: (_) => const SecretEditScreen());
                }
                if (settings.name != null && settings.name!.startsWith('/item/')) {
                  final itemId = Uri.decodeComponent(settings.name!.substring('/item/'.length));
                  return MaterialPageRoute(builder: (_) => SecretDetailScreen(itemId: itemId));
                }
                if (settings.name == '/recover') {
                  return MaterialPageRoute(builder: (_) => const RecoveryScreen());
                }
                return MaterialPageRoute(
                  builder: (_) => VaultListScreen(email: widget.email, onLogout: widget.onLogout),
                );
              },
            );
        }
      },
    );
  }
}
