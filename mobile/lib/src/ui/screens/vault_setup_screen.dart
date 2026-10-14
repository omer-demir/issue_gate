import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/vault/vault_repository.dart';

/// MSM-4 (create vault + master password) + MSM-8 (Recovery Kit
/// generation/display). Mirrors web/src/app/vault/setup/page.tsx.
///
/// The Recovery Kit confirmation step is gated on
/// [VaultRepository.recoveryKitPendingAck] (not [VaultStatus]) so an
/// unrelated repository rebuild can never skip past it before the user
/// acknowledges saving the one-time-displayable key.
class VaultSetupScreen extends StatefulWidget {
  const VaultSetupScreen({super.key});

  @override
  State<VaultSetupScreen> createState() => _VaultSetupScreenState();
}

class _VaultSetupScreenState extends State<VaultSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _submitting = false;
  String? _error;
  String? _recoveryKey;
  bool _acknowledged = false;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_passwordController.text != _confirmController.text) {
      setState(() => _error = 'Master passwords do not match.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final vault = context.read<VaultRepository>();
      final recoveryKey = await vault.setupVault(_passwordController.text);
      setState(() => _recoveryKey = recoveryKey);
    } catch (_) {
      setState(() => _error = 'Could not create your vault. Your master password was not sent anywhere — please retry.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final recoveryKey = _recoveryKey;
    if (recoveryKey != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Save your Recovery Kit')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _Banner(
                  tone: _BannerTone.warning,
                  message: 'This is the only way to recover your vault if you forget your master password. '
                      'It is never sent to our servers and cannot be re-displayed.',
                ),
                const SizedBox(height: 24),
                Semantics(
                  label: 'Recovery key',
                  child: SelectableText(
                    recoveryKey,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                const SizedBox(height: 24),
                CheckboxListTile(
                  value: _acknowledged,
                  onChanged: (value) => setState(() => _acknowledged = value ?? false),
                  title: const Text('I have securely saved my Recovery Kit'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _acknowledged ? () => context.read<VaultRepository>().confirmRecoveryKitSaved() : null,
                  child: const SizedBox(height: 48, child: Center(child: Text('Continue to my vault'))),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Create your vault')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Your master password encrypts your secrets on this device before anything is sent anywhere. '
                  'It is never recoverable by resetting your account password.',
                ),
                const SizedBox(height: 16),
                if (_error != null) _Banner(tone: _BannerTone.error, message: _error!),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'Master password', border: OutlineInputBorder()),
                  validator: (value) =>
                      (value == null || value.length < 10) ? 'Use a longer, unique master password' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'Confirm master password', border: OutlineInputBorder()),
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: SizedBox(
                    height: 48,
                    child: Center(child: _submitting ? const CircularProgressIndicator() : const Text('Create vault')),
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

enum _BannerTone { warning, error }

class _Banner extends StatelessWidget {
  const _Banner({required this.tone, required this.message});

  final _BannerTone tone;
  final String message;

  @override
  Widget build(BuildContext context) {
    final color = tone == _BannerTone.error ? Theme.of(context).colorScheme.error : Colors.orange.shade800;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(message, style: TextStyle(color: color)),
      ),
    );
  }
}
