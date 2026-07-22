import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// suspended · Account suspended notice + appeal form
class SuspendedScreen extends StatefulWidget {
  const SuspendedScreen({super.key});

  @override
  State<SuspendedScreen> createState() => _SuspendedScreenState();
}

class _SuspendedScreenState extends State<SuspendedScreen> {
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _appeal = TextEditingController();
  bool _confirmed = false;

  @override
  void dispose() {
    _email.dispose();
    _phone.dispose();
    _appeal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF151312),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 480),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF09090B),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: AppColors.likeRed.withOpacity(0.20)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppColors.likeRed.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.likeRed.withOpacity(0.25)),
                        ),
                        child: Icon(Ionicons.ban_outline, size: 24, color: AppColors.likeRed.withOpacity(0.85)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: const [
                            Text('Account Suspended',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
                            SizedBox(height: 2),
                            Text('@mira.k',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textGray500)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text('Your account has been suspended due to a violation of our Community Guidelines.',
                      style: TextStyle(fontSize: 13, height: 1.6, fontWeight: FontWeight.w600, color: AppColors.textGray200)),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.03),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('REASON:',
                            style: TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: AppColors.likeRed.withOpacity(0.9))),
                        const SizedBox(height: 4),
                        const Text('Spam or misleading content',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('SUBMIT APPEAL',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: AppColors.textGray500)),
                  const SizedBox(height: 12),
                  _field(_email, 'Contact Email'),
                  const SizedBox(height: 12),
                  _field(_phone, 'Phone Number', keyboard: TextInputType.phone),
                  const SizedBox(height: 12),
                  _field(_appeal, 'Explain why this suspension should be reviewed...', maxLines: 4),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => setState(() => _confirmed = !_confirmed),
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.03),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(_confirmed ? Ionicons.checkbox : Ionicons.square_outline,
                              size: 18, color: _confirmed ? AppColors.successGreen : AppColors.textGray500),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text('I confirm that the information provided is accurate and complete.',
                                style: TextStyle(fontSize: 12, height: 1.4, fontWeight: FontWeight.w700, color: AppColors.textGray300)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _confirmed ? () {} : null,
                      icon: const Icon(Ionicons.send_outline, size: 16),
                      label: const Text('Submit Appeal',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        disabledBackgroundColor: Colors.white.withOpacity(0.4),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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

  Widget _field(TextEditingController c, String hint, {int maxLines = 1, TextInputType? keyboard}) {
    return TextField(
      controller: c,
      maxLines: maxLines,
      keyboardType: keyboard,
      style: const TextStyle(fontSize: 13, color: Colors.white),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.25)),
        filled: true,
        fillColor: Colors.black,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: AppColors.likeRed.withOpacity(0.4)),
        ),
      ),
    );
  }
}
