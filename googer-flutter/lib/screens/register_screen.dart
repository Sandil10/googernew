import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../services/auth_service.dart';
import '../services/api_client.dart';
import 'home_feed_screen.dart';

/// 1b · Register
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _isSeller = false;
  bool _accepted = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter an email and password.');
      return;
    }
    if (password != _confirm.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    if (!RegExp(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$').hasMatch(password)) {
      setState(() => _error = 'Password must be 8+ chars with upper, lower, and a number.');
      return;
    }
    if (!_accepted) {
      setState(() => _error = 'Please accept the Terms & Conditions.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService.register(
        email: email,
        password: password,
        username: email.split('@').first,
        fullName: email.split('@').first,
      );
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const HomeFeedScreen()),
        (route) => false,
      );
    } on NoInternetException {
      if (!mounted) return;
      setState(() => _error = 'Please connect to the internet and try again.');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AppColors.likeRed,
          behavior: SnackBarBehavior.floating,
          content: Row(
            children: [
              Icon(Ionicons.cloud_offline_outline, size: 18, color: Colors.white),
              SizedBox(width: 10),
              Expanded(child: Text('No internet connection. Please connect and try again.')),
            ],
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 448),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.bg0,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.inputBorder),
                  boxShadow: [BoxShadow(color: Colors.white.withOpacity(0.08), blurRadius: 50, spreadRadius: -12)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: AppColors.accentPurple,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'G',
                          style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    _SegmentToggle(selected: _isSeller ? 1 : 0, onChanged: (i) => setState(() => _isSeller = i == 1)),
                    const SizedBox(height: 12),
                    _field(hint: 'Enter Email', controller: _email, keyboardType: TextInputType.emailAddress),
                    const SizedBox(height: 12),
                    _field(hint: 'Enter Password', controller: _password, obscure: true),
                    const SizedBox(height: 4),
                    _strengthMeter(),
                    const SizedBox(height: 12),
                    _field(hint: 'Confirm Password', controller: _confirm, obscure: true),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!, style: const TextStyle(fontSize: 11, color: AppColors.likeRed)),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        SizedBox(
                          width: 15,
                          height: 15,
                          child: Checkbox(
                            value: _accepted,
                            onChanged: (v) => setState(() => _accepted = v ?? false),
                            side: const BorderSide(color: AppColors.inputBorder),
                            fillColor: MaterialStateProperty.all(AppColors.bg2),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: RichText(
                            text: TextSpan(
                              style: const TextStyle(fontSize: 9.5, color: AppColors.textGray400),
                              children: [
                                const TextSpan(text: 'I accept the '),
                                TextSpan(text: 'Terms & Conditions', style: TextStyle(color: AppColors.likeRed, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _register,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFE5E7EB),
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                        ),
                        child: _loading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.bg0),
                              )
                            : Text('Create', style: AppText.buttonLabel),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: RichText(
                          text: TextSpan(
                            children: [
                              TextSpan(text: 'Already have account? — ', style: AppText.footNote),
                              TextSpan(text: 'Login', style: AppText.footNote.copyWith(color: AppColors.likeRed, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field({required String hint, required TextEditingController controller, bool obscure = false, TextInputType? keyboardType}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inputBorder),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscure,
              keyboardType: keyboardType,
              style: AppText.inputText,
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: hint,
                hintStyle: AppText.inputHint,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 11),
              ),
            ),
          ),
          if (obscure) const Icon(Ionicons.eye_off_outline, size: 17, color: AppColors.textGray600),
        ],
      ),
    );
  }

  Widget _strengthMeter() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('SECURITY STRENGTH', style: TextStyle(fontSize: 7.5, fontWeight: FontWeight.w600, color: AppColors.textGray400, letterSpacing: 0.4)),
              Text('STRONG', style: TextStyle(fontSize: 7.5, fontWeight: FontWeight.w700, color: AppColors.successGreen, letterSpacing: 0.4)),
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: List.generate(3, (i) => Expanded(
              child: Container(
                margin: EdgeInsets.only(right: i < 2 ? 2 : 0),
                height: 2,
                decoration: BoxDecoration(color: AppColors.successGreen, borderRadius: BorderRadius.circular(9999)),
              ),
            )),
          ),
        ],
      ),
    );
  }
}

class _SegmentToggle extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;

  const _SegmentToggle({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(9999),
        border: Border.all(color: AppColors.inputBorder),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(child: _segButton('User', 0)),
          Expanded(child: _segButton('Seller', 1)),
        ],
      ),
    );
  }

  Widget _segButton(String label, int index) {
    final isActive = selected == index;
    return GestureDetector(
      onTap: () => onChanged(index),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(9999),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isActive ? Colors.black : AppColors.textGray600),
        ),
      ),
    );
  }
}
