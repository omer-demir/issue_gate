import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/vault/vault_repository.dart';

/// MSM-9: vault recovery via Recovery Kit when the master password is lost.
/// Mirrors web/src/app/vault/recover/page.tsx.
class RecoveryScreen extends StatefulWidget {
  const RecoveryScreen({super.key});

  @override
  State<RecoveryScreen> createState() => _RecoveryScreenState();
}

class _RecoveryScreenState extends State<RecoveryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _recoveryKeyController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _recoveryKeyController.dispose();
    _newPasswordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_newPasswordController.text != _confirmController.text) {
      setState(() => _error = 'New master passwords do not match.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context
          .read<VaultRepository>()
          .recoverWithKit(_recoveryKeyController.text.trim(), _newPasswordController.text);
      if (mounted) Navigator.of(context).pop();
    } on StateError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not recover your vault. Please check your Recovery Kit and try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recover your vault')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Enter your Recovery Kit key and choose a new master password.'),
                const SizedBox(height: 16),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  ),
                TextFormField(
                  controller: _recoveryKeyController,
                  decoration: const InputDecoration(labelText: 'Recovery key', border: OutlineInputBorder()),
                  validator: (value) => (value == null || value.isEmpty) ? 'Recovery key is required' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _newPasswordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'New master password', border: OutlineInputBorder()),
                  validator: (value) =>
                      (value == null || value.length < 10) ? 'Use a longer, unique master password' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'Confirm new master password', border: OutlineInputBorder()),
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: SizedBox(
                    height: 48,
                    child: Center(child: _submitting ? const CircularProgressIndicator() : const Text('Recover vault')),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
