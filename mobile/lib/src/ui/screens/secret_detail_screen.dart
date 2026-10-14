import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/vault/vault_repository.dart';
import 'secret_edit_screen.dart';

/// MSM-6 (view/copy a secret) + MSM-7 (edit/delete). Mirrors
/// web/src/app/vault/[itemId]/page.tsx.
class SecretDetailScreen extends StatelessWidget {
  const SecretDetailScreen({super.key, required this.itemId});

  final String itemId;

  Future<void> _confirmDelete(BuildContext context, VaultRepository vault) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this secret?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const SizedBox(height: 48, child: Center(child: Text('Cancel'))),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const SizedBox(height: 48, child: Center(child: Text('Delete'))),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await vault.deleteSecret(itemId);
      if (context.mounted) Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VaultRepository>(
      builder: (context, vault, _) {
        final secret = vault.getSecret(itemId);
        if (secret == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Secret')),
            body: const Center(child: Text('This secret is no longer available.')),
          );
        }
        final data = secret.data;
        return Scaffold(
          appBar: AppBar(
            title: Text(data.title.isEmpty ? '(untitled)' : data.title),
            actions: [
              IconButton(
                tooltip: 'Edit',
                icon: const Icon(Icons.edit_outlined),
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(builder: (_) => SecretEditScreen(itemId: itemId, initial: data)),
                ),
              ),
              IconButton(
                tooltip: 'Delete',
                icon: const Icon(Icons.delete_outline),
                onPressed: () => _confirmDelete(context, vault),
              ),
            ],
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                if (secret.pendingSync)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: Text('Pending sync — will upload once you are back online.'),
                  ),
                if (data.username != null) _CopyableField(label: 'Username', value: data.username!),
                if (data.password != null) _CopyableField(label: 'Password', value: data.password!, obscure: true),
                if (data.url != null) _CopyableField(label: 'URL', value: data.url!),
                if (data.notes != null) ...[
                  const SizedBox(height: 16),
                  Text('Notes', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 4),
                  Text(data.notes!),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _CopyableField extends StatefulWidget {
  const _CopyableField({required this.label, required this.value, this.obscure = false});

  final String label;
  final String value;
  final bool obscure;

  @override
  State<_CopyableField> createState() => _CopyableFieldState();
}

class _CopyableFieldState extends State<_CopyableField> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final displayValue = widget.obscure && !_revealed ? '•' * widget.value.length.clamp(6, 20) : widget.value;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.label, style: Theme.of(context).textTheme.labelLarge),
                Text(displayValue, semanticsLabel: widget.obscure && !_revealed ? '${widget.label} hidden' : displayValue),
              ],
            ),
          ),
          if (widget.obscure)
            IconButton(
              tooltip: _revealed ? 'Hide' : 'Reveal',
              icon: Icon(_revealed ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _revealed = !_revealed),
            ),
          IconButton(
            tooltip: 'Copy ${widget.label}',
            icon: const Icon(Icons.copy),
            onPressed: () => copyToClipboard(context, widget.label, widget.value),
          ),
        ],
      ),
    );
  }
}
