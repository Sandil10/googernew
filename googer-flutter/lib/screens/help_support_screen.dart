import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

class _Topic {
  final String title;
  final IconData icon;
  final String body;
  const _Topic(this.title, this.icon, this.body);
}

/// help-support · Help & Support
class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  static const _topics = <_Topic>[
    _Topic('Account & Security', Ionicons.shield_checkmark_outline,
        'Login problems, OTP, passkey, trusted devices, suspicious sessions, and account recovery.'),
    _Topic('Orders & Payments', Ionicons.receipt_outline,
        'Product orders, top-ups, withdrawals, refunds, wallet balance, and payment verification.'),
    _Topic('Products & Ads', Ionicons.megaphone_outline,
        'Product listings, ad campaigns, upload content, blurred previews, reposts, shares, and reach.'),
    _Topic('Profile & Privacy', Ionicons.person_circle_outline,
        'Profile uploads, contact visibility, privacy settings, blocked accounts, comments, and reports.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Help & Support', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Choose the issue type and continue from the right Googer support area.',
              style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('GOOGER SUPPORT',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2, color: AppColors.textGray500)),
                const SizedBox(height: 8),
                const Text('Start from chat for account-specific help',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 8),
                const Text(
                    'Support conversations appear as Googer Support when an admin handles your request. Include order numbers, product links, screenshots, or transaction IDs when relevant.',
                    style: TextStyle(fontSize: 13, height: 1.5, color: AppColors.textGray400)),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('Open Chats',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ..._topics.map(_topicCard),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.10),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.amber.withOpacity(0.20)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Security warning',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.amber.shade100)),
                const SizedBox(height: 8),
                Text(
                    'Googer support will never ask for your password, OTP, passkey, private key, or full card details. If someone asks for those, do not share them and report the conversation.',
                    style: TextStyle(fontSize: 13, height: 1.5, color: Colors.amber.shade100.withOpacity(0.75))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _topicCard(_Topic t) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(t.icon, size: 20, color: Colors.white),
          ),
          const SizedBox(height: 14),
          Text(t.title.toUpperCase(),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1, color: Colors.white)),
          const SizedBox(height: 10),
          Text(t.body, style: const TextStyle(fontSize: 13, height: 1.5, color: AppColors.textGray300)),
        ],
      ),
    );
  }
}
