import 'dart:async';

import 'package:flutter/material.dart';

import '../services/app_session.dart';
import '../theme/app_colors.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _otp = TextEditingController();
  bool _loading = false;
  bool _otpRequired = false;
  String _message = '';
  String _error = '';
  Map<String, dynamic>? _approval;
  Timer? _approvalTimer;

  @override
  void dispose() {
    _approvalTimer?.cancel();
    _email.dispose();
    _password.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submitLogin() async {
    setState(() {
      _loading = true;
      _error = '';
      _message = '';
    });
    try {
      final session = SessionScope.of(context);
      final result = await session.login(_email.text, _password.text);
      if (result['otpRequired'] == true) {
        setState(() {
          _otpRequired = true;
          _message = result['debugOtp'] != null ? 'Debug OTP: ${result['debugOtp']}' : (result['message'] ?? 'OTP sent.');
        });
      } else if (result['approvalRequired'] == true) {
        _beginApprovalWait(Map<String, dynamic>.from(result['approval'] ?? {}));
      }
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final session = SessionScope.of(context);
      final result = await session.verifyLoginOtp(
        email: _email.text,
        password: _password.text,
        otp: _otp.text,
      );
      if (result['approvalRequired'] == true) {
        _beginApprovalWait(Map<String, dynamic>.from(result['approval'] ?? {}));
      }
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _beginApprovalWait(Map<String, dynamic> approval) {
    _approvalTimer?.cancel();
    setState(() {
      _approval = approval;
      _message = 'Waiting for a trusted device to approve this login.';
    });
    _approvalTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      final id = approval['id']?.toString() ?? '';
      final token = approval['token']?.toString() ?? '';
      if (id.isEmpty || token.isEmpty) return;
      try {
        final result = await SessionScope.of(context).pollDeviceApproval(id, token);
        if (result['token'] != null || result['status'] == 'approved') {
          _approvalTimer?.cancel();
        } else {
          setState(() => _message = result['message'] ?? 'Still waiting for approval.');
        }
      } catch (error) {
        _approvalTimer?.cancel();
        setState(() {
          _approval = null;
          _error = error.toString();
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 390),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.play_arrow_rounded, color: Colors.white),
                      ),
                      const SizedBox(width: 10),
                      const Text('Googer', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 26),
                  const Text('Login', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white)),
                  const SizedBox(height: 6),
                  const Text('Use the same account as the web app.', style: TextStyle(fontSize: 13, color: AppColors.textMuted)),
                  const SizedBox(height: 24),
                  _input(_email, 'Email', Icons.mail_outline, keyboardType: TextInputType.emailAddress),
                  const SizedBox(height: 12),
                  _input(_password, 'Password or 6-digit passkey', Icons.lock_outline, obscure: true),
                  if (_otpRequired) ...[
                    const SizedBox(height: 12),
                    _input(_otp, '6-digit OTP', Icons.pin_outlined, keyboardType: TextInputType.number),
                  ],
                  if (_message.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _notice(_message, AppColors.accentGreen),
                  ],
                  if (_approval != null) ...[
                    const SizedBox(height: 14),
                    const LinearProgressIndicator(color: AppColors.accentBlue, backgroundColor: AppColors.surfaceRaised),
                  ],
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _notice(_error.replaceFirst('Exception: ', ''), AppColors.accentRed),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _loading || _approval != null ? null : (_otpRequired ? _verifyOtp : _submitLogin),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                      child: Text(
                        _loading ? 'Please wait...' : (_otpRequired ? 'Verify OTP' : 'Login'),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _input(
    TextEditingController controller,
    String hint,
    IconData icon, {
    bool obscure = false,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
        prefixIcon: Icon(icon, size: 18, color: AppColors.textMuted),
        filled: true,
        fillColor: AppColors.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: AppColors.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: AppColors.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Colors.white54)),
      ),
    );
  }

  Widget _notice(String text, Color color) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}
