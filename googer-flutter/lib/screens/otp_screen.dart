import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';

/// 1h · Verify OTP / Reset Password
class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key});

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
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
                decoration: BoxDecoration(
                  color: AppColors.bg0,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.inputBorder),
                  boxShadow: [BoxShadow(color: Colors.white.withOpacity(0.08), blurRadius: 50, spreadRadius: -12)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withOpacity(0.1)),
                          ),
                          child: const Icon(Ionicons.keypad_outline, size: 22, color: AppColors.textGray300),
                        ),
                        const SizedBox(height: 12),
                        const Text('Verify OTP', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
                        const SizedBox(height: 6),
                        RichText(
                          textAlign: TextAlign.center,
                          text: TextSpan(
                            style: const TextStyle(fontSize: 11.5, color: AppColors.textGray500, height: 1.5),
                            children: [
                              const TextSpan(text: "We've sent a 6-digit code to\n"),
                              TextSpan(text: 'mira@googer.app', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.textGray300)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.bg2,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.inputBorder),
                      ),
                      child: TextFormField(
                        initialValue: '482913',
                        textAlign: TextAlign.center,
                        maxLength: 6,
                        style: AppText.mono(16, FontWeight.w600).copyWith(letterSpacing: 8),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          counterText: '',
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {},
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                        ),
                        child: Text('Verify & Continue', style: AppText.buttonLabel),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Center(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textGray500, letterSpacing: 0.6),
                          children: [
                            const TextSpan(text: "DIDN'T RECEIVE? "),
                            TextSpan(text: 'RESEND OTP', style: TextStyle(color: AppColors.likeRed)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: Text('BACK TO LOGIN',
                          style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: Colors.white.withOpacity(0.45), letterSpacing: 1)),
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
}
