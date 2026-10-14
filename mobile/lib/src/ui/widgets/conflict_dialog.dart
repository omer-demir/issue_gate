import 'package:flutter/material.dart';

import '../../core/api/models.dart';
import '../../core/vault/vault_repository.dart';

/// MSM-15: 409 version-conflict surfacing with side-by-side resolution.
/// Mirrors web/src/components/ConflictDialog.tsx.
Future<String?> showConflictDialog(BuildContext context, ConflictState conflict) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: const Text('This secret changed on another device'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Someone (maybe you, on another device) saved a different version. Choose which to keep:'),
            const SizedBox(height: 16),
            _ConflictColumn(label: 'Your version', data: conflict.yourData),
            const SizedBox(height: 16),
            _ConflictColumn(label: 'Server version', data: conflict.serverData),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop('theirs'),
          child: const SizedBox(height: 48, child: Center(child: Text('Keep server version'))),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop('mine'),
          child: const SizedBox(height: 48, child: Center(child: Text('Keep my version'))),
        ),
      ],
    ),
  );
}

class _ConflictColumn extends StatelessWidget {
  const _ConflictColumn({required this.label, required this.data});

  final String label;
  final SecretData? data;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        if (data == null)
          const Text('(unavailable)')
        else ...[
          Text('Title: ${data!.title}'),
          if (data!.username != null) Text('Username: ${data!.username}'),
          if (data!.url != null) Text('URL: ${data!.url}'),
        ],
      ],
    );
  }
}
