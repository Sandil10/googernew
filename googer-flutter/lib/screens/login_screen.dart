import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../theme/colors.dart';
import 'forgot_password_screen.dart';
import 'home_feed_screen.dart';
import 'register_screen.dart';

/// Login — live port of the web `LoginModal`.
/// Email + password/passkey, and the OTP second step when the backend
/// answers `otpRequired`.
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
  bool _obscure = true;
  bool _otpStage = false;
  bool _approvalStage = false;
  String? _error;
  String? _message;
  String? _debugOtp;
  String? _approvalId;
  String? _approvalToken;
  Timer? _approvalTimer;
  bool _approvalPolling = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _otp.dispose();
    _approvalTimer?.cancel();
    super.dispose();
  }

  void _goHome() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const HomeFeedScreen()),
    );
  }

  Future<void> _login() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });

    final result = await Api.login(email, password);
    if (!mounted) return;
    setState(() => _loading = false);

    if (result == null) {
      _goHome();
      return;
    }
    // Api.login signals the OTP step as "OTP_REQUIRED|<message>".
    if (result.startsWith('OTP_REQUIRED|')) {
      final text = result.substring('OTP_REQUIRED|'.length);
      setState(() {
        _otpStage = true;
        _message = text;
        _debugOtp = _extractDebugOtp(text);
      });
      return;
    }
    if (result.startsWith('APPROVAL_REQUIRED|')) {
      _startApprovalWait(result);
      return;
    }
    setState(() => _error = result);
  }

  String? _extractDebugOtp(String text) {
    final match = RegExp(r'OTP:\s*(\d{4,8})').firstMatch(text);
    return match?.group(1);
  }

  Future<void> _verifyOtp() async {
    final otp = _otp.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      setState(() => _error = 'Please enter the 6-digit OTP.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = await Api.verifyLoginOtp(
      _email.text.trim(),
      _password.text,
      otp,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (error == null) {
      _goHome();
    } else if (error.startsWith('APPROVAL_REQUIRED|')) {
      _startApprovalWait(error);
    } else {
      setState(() => _error = error);
    }
  }

  void _startApprovalWait(String result) {
    final parts = result.split('|');
    if (parts.length < 4) {
      setState(() => _error = 'A trusted device must approve this login.');
      return;
    }
    _approvalTimer?.cancel();
    setState(() {
      _approvalId = parts[1];
      _approvalToken = parts[2];
      _approvalStage = true;
      _otpStage = false;
      _loading = false;
      _approvalPolling = false;
      _error = null;
      _message = parts.sublist(3).join('|');
    });
    _pollApproval();
    _approvalTimer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _pollApproval(),
    );
  }

  Future<void> _pollApproval() async {
    final id = _approvalId;
    final token = _approvalToken;
    if (!_approvalStage ||
        id == null ||
        token == null ||
        _loading ||
        _approvalPolling) {
      return;
    }
    setState(() => _approvalPolling = true);
    final String? result;
    try {
      result = await Api.getDeviceApprovalStatus(id, token);
    } finally {
      if (mounted && _approvalStage) {
        setState(() => _approvalPolling = false);
      }
    }
    if (!mounted || !_approvalStage) return;
    if (result == null) {
      _approvalTimer?.cancel();
      _goHome();
      return;
    }
    final lower = result.toLowerCase();
    if (lower.contains('denied') || lower.contains('expired')) {
      _approvalTimer?.cancel();
      setState(() {
        _approvalStage = false;
        _otpStage = true;
        _approvalPolling = false;
        _error = result;
        _message = 'Please request a fresh OTP and try again.';
      });
      return;
    }
    setState(() => _message = result);
  }

  Future<void> _resendOtp() async {
    _approvalTimer?.cancel();
    setState(() {
      _loading = true;
      _error = null;
      _approvalStage = false;
      _approvalId = null;
      _approvalToken = null;
    });
    final result = await Api.login(_email.text.trim(), _password.text);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result != null && result.startsWith('OTP_REQUIRED|')) {
        final text = result.substring('OTP_REQUIRED|'.length);
        _message = text;
        _debugOtp = _extractDebugOtp(text);
      } else if (result != null && result.startsWith('APPROVAL_REQUIRED|')) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _startApprovalWait(result);
        });
      } else if (result != null) {
        _error = result;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 62,
                      height: 62,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Image.asset(
                        'assets/images/googer.png',
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Ionicons.planet_outline,
                          size: 26,
                          color: AppColors.textGray300,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    _approvalStage
                        ? 'Approve this device'
                        : _otpStage
                        ? 'Verify Login OTP'
                        : 'Welcome back',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _approvalStage
                        ? 'Open a trusted browser/device and approve this login request.'
                        : _otpStage
                        ? 'Enter the 6-digit code sent to your email.'
                        : 'Sign in to continue to Googer.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textGray500,
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (_approvalStage)
                    _approvalWaitingPanel()
                  else if (_otpStage)
                    ..._otpFields()
                  else
                    ..._loginFields(),
                  if (_message != null) ...[
                    const SizedBox(height: 12),
                    _banner(_message!, AppColors.successGreen),
                  ],
                  if (_debugOtp != null) ...[
                    const SizedBox(height: 8),
                    Center(
                      child: Text(
                        'Debug OTP: $_debugOtp',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textGray500,
                        ),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    _banner(_error!, AppColors.likeRed),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 46,
                    child: ElevatedButton(
                      onPressed: (_loading || _approvalPolling)
                          ? null
                          : _approvalStage
                          ? _pollApproval
                          : (_otpStage ? _verifyOtp : _login),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accentPurple,
                        disabledBackgroundColor: AppColors.bg3,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: (_loading || _approvalPolling)
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              _approvalStage
                                  ? 'Check approval now'
                                  : _otpStage
                                  ? 'Verify OTP'
                                  : 'Log in',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (_otpStage && !_approvalStage)
                    Center(
                      child: TextButton(
                        onPressed: _loading ? null : _resendOtp,
                        child: const Text(
                          'Resend OTP',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: AppColors.purpleText,
                          ),
                        ),
                      ),
                    )
                  else if (!_approvalStage) ...[
                    Center(
                      child: TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ForgotPasswordScreen(),
                          ),
                        ),
                        child: const Text(
                          'Forgot Password?',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: AppColors.purpleText,
                          ),
                        ),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          "Don't have an account?",
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textGray500,
                          ),
                        ),
                        TextButton(
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const RegisterScreen(),
                            ),
                          ),
                          child: const Text(
                            'Register',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (_approvalStage) ...[
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: _loading
                            ? null
                            : () {
                                _approvalTimer?.cancel();
                                setState(() {
                                  _approvalStage = false;
                                  _otpStage = true;
                                  _message =
                                      'If approval did not arrive, request a fresh OTP.';
                                });
                              },
                        child: const Text(
                          'Use a new OTP instead',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: AppColors.purpleText,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _loginFields() => [
    _input(
      controller: _email,
      hint: 'Enter Email',
      icon: Ionicons.mail_outline,
      keyboard: TextInputType.emailAddress,
    ),
    const SizedBox(height: 12),
    _input(
      controller: _password,
      // web placeholder is exactly this
      hint: 'Password or 6-digit passkey',
      icon: Ionicons.lock_closed_outline,
      obscure: _obscure,
      suffix: IconButton(
        icon: Icon(
          _obscure ? Ionicons.eye_outline : Ionicons.eye_off_outline,
          size: 17,
          color: AppColors.textGray500,
        ),
        onPressed: () => setState(() => _obscure = !_obscure),
      ),
      onSubmitted: (_) => _login(),
    ),
  ];

  Widget _approvalWaitingPanel() => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.bg2,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.borderWhite10),
    ),
    child: const Column(
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.successGreen,
          ),
        ),
        SizedBox(height: 12),
        Text(
          'Waiting for trusted-device approval...',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        SizedBox(height: 6),
        Text(
          'Do not resend OTP while this is pending. The app will continue automatically after approval.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11.5, color: AppColors.textGray500),
        ),
      ],
    ),
  );

  List<Widget> _otpFields() => [
    _input(
      controller: _otp,
      hint: 'Enter 6-Digit OTP',
      icon: Ionicons.keypad_outline,
      keyboard: TextInputType.number,
      onSubmitted: (_) => _verifyOtp(),
    ),
  ];

  Widget _input({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    TextInputType keyboard = TextInputType.text,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboard,
      onSubmitted: onSubmitted,
      autocorrect: false,
      enableSuggestions: false,
      style: const TextStyle(fontSize: 13, color: Colors.white),
      cursorColor: AppColors.accentPurple,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 12.5,
          color: AppColors.textGray600,
        ),
        prefixIcon: Icon(icon, size: 17, color: AppColors.textGray500),
        suffixIcon: suffix,
        filled: true,
        fillColor: AppColors.bg2,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.purpleBorder),
        ),
      ),
    );
  }

  Widget _banner(String text, Color color) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }
}
