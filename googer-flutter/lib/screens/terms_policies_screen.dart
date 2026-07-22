import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// terms-and-policies · Terms and Policies (tabbed Terms / Privacy)
class TermsPoliciesScreen extends StatefulWidget {
  const TermsPoliciesScreen({super.key});

  @override
  State<TermsPoliciesScreen> createState() => _TermsPoliciesScreenState();
}

class _TermsPoliciesScreenState extends State<TermsPoliciesScreen> {
  bool _privacy = true;

  static const _privacyContent =
      'Privacy Policy\n\nIntroduction\n\nWelcome to Googer, a vibrant social media platform that offers video and photo sharing, along with an online store. This Privacy Policy outlines our commitment to protecting your privacy and governs the use of your personal information on the Googer platform.\n\nBy accessing and using Googer, you consent to the practices described in this policy.\n\nInformation Collection\n\nWhen you create an account on Googer, we collect certain personal information such as your username, email address, and password. Googer enables you to share videos, photos, and other content that may be visible to other users as per your privacy settings.\n\nHow We Use Your Information\n\nWe utilize the collected information to provide you with a seamless experience on Googer, including personalized content recommendations, communication tools, and access to the online store.\n\nSharing and Disclosure\n\nAny content you share publicly on Googer, including videos, photos, and comments, may be accessible to other users and the general public. We may share your information with trusted third-party service providers who assist us in delivering and enhancing the platform.\n\nChildren\'s Privacy\n\nGooger is not intended for users under the age of 13. We do not knowingly collect personal information from individuals in this age group.\n\nContact Us\n\nFor inquiries about this Privacy Policy or your privacy on Googer, please use our Help & Support page.';

  static const _termsContent =
      'Terms & Conditions\n\nWelcome to Googer, a platform designed to connect individuals, share experiences, and promote communication, as well as facilitate business transactions.\n\nGeneral Agreement\nBy using Googer\'s services you agree to abide by the terms set forth in this document.\n\n1. Account & Eligibility\n- Users must provide accurate information\n- Minimum age requirement (18+ recommended)\n- One user = one account only\n- Account security is user responsibility\n\n2. Content Ownership & License\n- Creators must own or have rights to sell content\n- No copyrighted or stolen content allowed\n- Platform not responsible for user-generated content\n\n3. Pricing & Payments\n- Creators set their own prices (within allowed range)\n- Platform will deduct a service fee\n- Payouts may take a few working days\n\n4. Refund Policy\n- Digital content is generally non-refundable\n- Refund only if content not delivered, technical issues, or fraud detected\n\n5. Prohibited Content\n- Copyrighted, adult/illegal, violent, spam, or scam content is not allowed\n\n6. Platform Rights\n- Platform can remove content and suspend accounts for violations\n\nBy accepting this Agreement, you assert that you are at least 18 years old and fully capable of adhering to its terms.';

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
        title: const Text('Terms and Policies', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('GOOGER LEGAL',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 4, color: AppColors.textGray500)),
          const SizedBox(height: 8),
          Text(_privacy ? 'Privacy Policy' : 'Terms & Conditions',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 8),
          Text('Please read the Googer ${_privacy ? 'Privacy Policy' : 'Terms & Conditions'} carefully before using the platform.',
              style: const TextStyle(fontSize: 12, height: 1.5, color: AppColors.textGray400)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _tabButton('Terms & Conditions', !_privacy, () => setState(() => _privacy = false))),
              const SizedBox(width: 8),
              Expanded(child: _tabButton('Privacy Policy', _privacy, () => setState(() => _privacy = true))),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.bg1,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_privacy ? 'Privacy Policy' : 'Terms & Conditions',
                    style: const TextStyle(fontSize: 10, color: AppColors.textGray400)),
                const SizedBox(height: 12),
                Text(_privacy ? _privacyContent : _termsContent,
                    style: const TextStyle(fontSize: 12, height: 1.7, color: AppColors.textGray300)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.bg1,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: RichText(
              text: const TextSpan(
                style: TextStyle(fontSize: 12, height: 1.5, color: AppColors.textGray400),
                children: [
                  TextSpan(text: 'Need legal or privacy help? Open '),
                  TextSpan(
                      text: 'Help & Support',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, decoration: TextDecoration.underline)),
                  TextSpan(text: '.'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabButton(String label, bool active, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: active ? Colors.white : AppColors.bg1,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? Colors.white : AppColors.borderWhite10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('READ',
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                    color: active ? Colors.black.withOpacity(0.45) : AppColors.textGray500)),
            const SizedBox(height: 6),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: active ? Colors.black : Colors.white)),
          ],
        ),
      ),
    );
  }
}
