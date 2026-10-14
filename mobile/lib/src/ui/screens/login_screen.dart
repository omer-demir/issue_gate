import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';

typedef AuthenticatedCallback = Future<void> Function(String accessToken, String refreshToken, String email);

/// MSM-10 (mobile realization): account login. Registration lives in
/// [RegisterScreen]; this screen links to it rather than duplicating fields.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onAuthenticated, required this.onNavigateRegister});

  final AuthenticatedCallback onAuthenticated;
  final void Function(BuildContext context) onNavigateRegister;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final tokens = await api.login(_emailController.text.trim(), _passwordController.text);
      await widget.onAuthenticated(tokens.accessToken, tokens.refreshToken, _emailController.text.trim());
    } on ApiException catch (e) {
      setState(() {
        _error = e.status == 0 ? 'You appear to be offline. Please check your connection.' : 'Incorrect email or password.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
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
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Account password', border: OutlineInputBorder()),
                  validator: (value) => (value == null || value.isEmpty) ? 'Password is required' : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: SizedBox(
                    height: 48,
                    child: Center(child: _submitting ? const CircularProgressIndicator() : const Text('Sign in')),
                  ),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _submitting ? null : () => widget.onNavigateRegister(context),
                  child: const SizedBox(height: 48, child: Center(child: Text('Create an account'))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
