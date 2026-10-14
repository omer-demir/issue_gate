import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:provider/provider.dart';

import '../../core/vault/vault_repository.dart';
import 'recovery_screen.dart';

/// MSM-5 (master password + optional biometric unlock). Mirrors
/// web/src/app/vault/unlock/page.tsx, plus a mobile-only biometric gate
/// (MSM-3) that only ever restores a DEK previously unlocked this
/// install — it never substitutes for the first master-password unlock.
class VaultUnlockScreen extends StatefulWidget {
  const VaultUnlockScreen({super.key});

  @override
  State<VaultUnlockScreen> createState() => _VaultUnlockScreenState();
}

class _VaultUnlockScreenState extends State<VaultUnlockScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _localAuth = LocalAuthentication();
  bool _submitting = false;
  bool _biometricAvailable = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _checkBiometricAvailability();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _checkBiometricAvailability() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      if (mounted) setState(() => _biometricAvailable = supported && canCheck);
    } on PlatformException {
      if (mounted) setState(() => _biometricAvailable = false);
    }
  }

  Future<void> _attemptBiometricUnlock() async {
    setState(() => _error = null);
    try {
      final didAuthenticate = await _localAuth.authenticate(
        localizedReason: 'Unlock your vault',
        options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
      );
      if (!didAuthenticate) return;
      final restored = await context.read<VaultRepository>().tryBiometricUnlock();
      if (!restored && mounted) {
        setState(() => _error = 'Biometric unlock is not set up on this device yet. Use your master password.');
      }
    } on PlatformException {
      // No biometrics enrolled, hardware unavailable, or the user cancelled/was
      // locked out — fall back to password entry without surfacing a scary error.
      if (mounted) setState(() => _biometricAvailable = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<VaultRepository>().unlock(_passwordController.text);
    } on StateError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Unlock your vault')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  ),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Master password', border: OutlineInputBorder()),
                  validator: (value) => (value == null || value.isEmpty) ? 'Master password is required' : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: SizedBox(
                    height: 48,
                    child: Center(child: _submitting ? const CircularProgressIndicator() : const Text('Unlock')),
                  ),
                ),
                if (_biometricAvailable) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _submitting ? null : _attemptBiometricUnlock,
                    icon: const Icon(Icons.fingerprint),
                    label: const SizedBox(height: 48, child: Center(child: Text('Use biometric unlock'))),
                  ),
                ],
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).push<void>(
                            MaterialPageRoute(builder: (_) => const RecoveryScreen()),
                          ),
                  child: const SizedBox(height: 48, child: Center(child: Text('Forgot your master password?'))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
