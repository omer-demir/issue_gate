import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/vault/vault_repository.dart';
import '../widgets/conflict_dialog.dart';

/// MSM-6 (list/view/copy, local-only) + MSM-14 (pending-sync indicator).
/// Mirrors web/src/app/vault/page.tsx.
class VaultListScreen extends StatefulWidget {
  const VaultListScreen({super.key, required this.email, required this.onLogout});

  final String email;
  final Future<void> Function() onLogout;

  @override
  State<VaultListScreen> createState() => _VaultListScreenState();
}

class _VaultListScreenState extends State<VaultListScreen> {
  bool _conflictDialogShowing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<VaultRepository>().loadSecrets());
  }

  Future<void> _maybeShowConflictDialog(VaultRepository vault) async {
    if (_conflictDialogShowing || vault.conflict == null) return;
    _conflictDialogShowing = true;
    final conflict = vault.conflict!;
    final choice = await showConflictDialog(context, conflict);
    _conflictDialogShowing = false;
    if (choice != null) {
      await vault.resolveConflict(choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VaultRepository>(
      builder: (context, vault, _) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowConflictDialog(vault));
        return Scaffold(
          appBar: AppBar(
            title: Text(widget.email),
            actions: [
              IconButton(
                tooltip: 'Lock vault',
                icon: const Icon(Icons.lock_outline),
                onPressed: () => vault.lock(),
              ),
              IconButton(
                tooltip: 'Sign out',
                icon: const Icon(Icons.logout),
                onPressed: () => widget.onLogout(),
              ),
            ],
          ),
          body: Column(
            children: [
              if (!vault.online)
                Container(
                  width: double.infinity,
                  color: Colors.amber.shade100,
                  padding: const EdgeInsets.all(8),
                  child: const Text('You are offline. Changes will sync once you are back online.', textAlign: TextAlign.center),
                ),
              if (vault.error != null)
                Container(
                  width: double.infinity,
                  color: Theme.of(context).colorScheme.errorContainer,
                  padding: const EdgeInsets.all(8),
                  child: Text(vault.error!, textAlign: TextAlign.center),
                ),
              Expanded(
                child: vault.loading && vault.secrets.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : vault.secrets.isEmpty
                        ? const Center(child: Text('No secrets yet. Tap + to add one.'))
                        : RefreshIndicator(
                            onRefresh: vault.loadSecrets,
                            child: ListView.separated(
                              itemCount: vault.secrets.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (context, index) {
                                final secret = vault.secrets[index];
                                return ListTile(
                                  minVerticalPadding: 16,
                                  title: Text(secret.data.title.isEmpty ? '(untitled)' : secret.data.title),
                                  subtitle: secret.data.username != null ? Text(secret.data.username!) : null,
                                  trailing: secret.pendingSync
                                      ? Tooltip(
                                          message: 'Pending sync',
                                          child: Icon(Icons.sync, color: Theme.of(context).colorScheme.secondary),
                                        )
                                      : null,
                                  onTap: () => Navigator.of(context).pushNamed('/item/${Uri.encodeComponent(secret.itemId)}'),
                                );
                              },
                            ),
                          ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: () => Navigator.of(context).pushNamed('/new'),
            tooltip: 'Add secret',
            child: const Icon(Icons.add),
          ),
        );
      },
    );
  }
}
