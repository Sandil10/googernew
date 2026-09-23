import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';

/// Forgot password — the web LoginModal's three-step reset:
/// 1. request an OTP for the email
/// 2. verify the 6-digit OTP (returns a reset token)
/// 3. set the new password
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _otp = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  int _step = 0; // 0 = email, 1 = otp, 2 = new password
  bool _loading = false;
  bool _obscure = true;
  String? _error;
  String? _message;
  String? _debugOtp;
  String? _resetToken;

  @override
  void dispose() {
    _email.dispose();
    _otp.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your registered email.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });
    final result = await Api.requestPasswordResetOtp(email);
    final error = result.error;
    final debugOtp = result.debugOtp;
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (error == null) {
        _step = 1;
        _message = 'OTP sent to your registered email.';
        _debugOtp = debugOtp;
      } else {
        _error = error;
      }
    });
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
    final result = await Api.verifyPasswordResetOtp(_email.text.trim(), otp);
    final error = result.error;
    final resetToken = result.resetToken;
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (error == null) {
        _resetToken = resetToken;
        _step = 2;
        _message = 'OTP verified. Choose a new password.';
      } else {
        _error = error;
      }
    });
  }

  Future<void> _resetPassword() async {
    final password = _password.text;
    if (password.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters.');
      return;
    }
    if (password != _confirm.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    if (_resetToken == null) {
      setState(() {
        _error = 'Reset session expired. Please request a new OTP.';
        _step = 0;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = await Api.resetPasswordWithOtp(
      _email.text.trim(),
      _resetToken!,
      password,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (error == null) {
      Navigator.maybePop(context);
    } else {
      setState(() => _error = error);
    }
  }

  String get _title => switch (_step) {
    1 => 'Verify OTP',
    2 => 'New password',
    _ => 'Reset password',
  };

  String get _subtitle => switch (_step) {
    1 => 'Enter the 6-digit code we emailed you.',
    2 => 'Choose a new password for your account.',
    _ => 'Enter your registered email to receive a secure OTP.',
  };

  String get _cta => switch (_step) {
    1 => 'Verify OTP',
    2 => 'Reset password',
    _ => 'Send OTP Code',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        // Steps back through the reset flow before it leaves the screen.
        leading: AppBackButton.appBar(
          onTap: () => _step == 0
              ? Navigator.maybePop(context)
              : setState(() {
                  _step -= 1;
                  _error = null;
                }),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 22),
                if (_step == 0)
                  _input(
                    controller: _email,
                    hint: 'Enter Email Address',
                    icon: Ionicons.mail_outline,
                    keyboard: TextInputType.emailAddress,
                    onSubmitted: (_) => _requestOtp(),
                  )
                else if (_step == 1)
                  _input(
                    controller: _otp,
                    hint: 'Enter 6-Digit OTP',
                    icon: Ionicons.keypad_outline,
                    keyboard: TextInputType.number,
                    onSubmitted: (_) => _verifyOtp(),
                  )
                else ...[
                  _input(
                    controller: _password,
                    hint: 'New Password',
                    icon: Ionicons.lock_closed_outline,
                    obscure: _obscure,
                    suffix: IconButton(
                      icon: Icon(
                        _obscure
                            ? Ionicons.eye_outline
                            : Ionicons.eye_off_outline,
                        size: 17,
                        color: AppColors.textGray500,
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _input(
                    controller: _confirm,
                    hint: 'Confirm New Password',
                    icon: Ionicons.lock_closed_outline,
                    obscure: _obscure,
                    onSubmitted: (_) => _resetPassword(),
                  ),
                ],
                if (_message != null) ...[
                  const SizedBox(height: 12),
                  _banner(_message!, AppColors.successGreen),
                ],
                if (_debugOtp != null && _step == 1) ...[
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
                const SizedBox(height: 20),
                SizedBox(
                  height: 46,
                  child: ElevatedButton(
                    onPressed: _loading
                        ? null
                        : switch (_step) {
                            1 => _verifyOtp,
                            2 => _resetPassword,
                            _ => _requestOtp,
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentPurple,
                      disabledBackgroundColor: AppColors.bg3,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(
                            _cta,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
                if (_step == 1)
                  Center(
                    child: TextButton(
                      onPressed: _loading ? null : _requestOtp,
                      child: const Text(
                        "Didn't receive? Resend OTP",
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: AppColors.purpleText,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

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
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.3)),
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
