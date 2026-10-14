import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import 'login_screen.dart';

/// MSM-10 (mobile realization): account registration, followed by an
/// immediate login to obtain a session (mirrors web's SessionProvider.register).
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.onAuthenticated});

  final AuthenticatedCallback onAuthenticated;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_passwordController.text != _confirmController.text) {
      setState(() => _error = 'Account passwords do not match.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final email = _emailController.text.trim();
      await api.register(email, _passwordController.text);
      final tokens = await api.login(email, _passwordController.text);
      await widget.onAuthenticated(tokens.accessToken, tokens.refreshToken, email);
    } on ApiException catch (e) {
      setState(() {
        _error = switch (e.status) {
          0 => 'You appear to be offline. Please check your connection.',
          409 => 'An account with this email already exists.',
          _ => 'Could not create your account. Please retry.',
        };
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'This account password protects access to your encrypted vault. '
                  'It is separate from your master password, which you will set up next '
                  'and which is never sent to our servers.',
                ),
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
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                  validator: (value) => (value == null || value.isEmpty) ? 'Email is required' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'Account password', border: OutlineInputBorder()),
                  validator: (value) =>
                      (value == null || value.length < 8) ? 'Use at least 8 characters' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: const InputDecoration(labelText: 'Confirm password', border: OutlineInputBorder()),
                  validator: (value) => (value == null || value.isEmpty) ? 'Please confirm your password' : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: SizedBox(
                    height: 48,
                    child: Center(child: _submitting ? const CircularProgressIndicator() : const Text('Create account')),
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
