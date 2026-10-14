import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'src/app.dart';
import 'src/core/api/api_client.dart';
import 'src/core/storage/secure_store.dart';
import 'src/core/sync/offline_queue.dart';
import 'src/core/vault/vault_repository.dart';

/// Base URL is injected at build/run time, e.g.
/// `flutter run --dart-define=API_BASE_URL=https://api.example.com`.
/// Defaults to the backend's local dev port (see backend/.env.example).
const String _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:4000',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final apiClient = ApiClient(baseUrl: _apiBaseUrl);
  final secureStore = SecureStore();
  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: apiClient),
        Provider<SecureStore>.value(value: secureStore),
        ChangeNotifierProvider<VaultRepository>(
          create: (_) => VaultRepository(
            apiClient: apiClient,
            secureStore: secureStore,
            offlineQueue: OfflineQueue(),
          ),
        ),
      ],
      child: const IssueGateApp(),
    ),
  );
}
