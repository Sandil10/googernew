import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets/kit.dart';

/* ───────────── Help & Support ───────────── */

class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen();

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen> {
  int? open = 0;
  final subject = TextEditingController();
  final message = TextEditingController();

  static const faqs = [
    ("How do I top up my wallet?", "Go to Wallet → Top Up, choose a Rupier coin pack and a payment method. Bank transfers are approved within 24 hours."),
    ("When do I get paid for ad views?", "Ad coin rewards are credited to your wallet in real time as viewers collect coins from your campaigns."),
    ("How does the blue verification badge work?", "Apply from Wallet → Get Verified with your NIC, passport or license. Review takes 1–3 business days."),
    ("Can I sell coins to other users?", "Yes — list them in Coins Management. Googer holds trades in escrow until both sides confirm."),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Help & Support")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Row(
          children: [
            (Icons.forum_outlined, "Live Chat", "/chat"),
            (Icons.mail_outline, "Email Us", null),
            (Icons.description_outlined, "Policies", "/terms"),
          ].map((q) {
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GoogerCard(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  onTap: q.$3 == null
                      ? null
                      : () => Navigator.pushNamed(context, q.$3!, arguments: q.$3 == "/chat" ? "googer_support" : null),
                  child: Column(children: [
                    Icon(q.$1, size: 20, color: GoogerColors.text),
                    const SizedBox(height: 7),
                    Overline(q.$2, color: GoogerColors.muted),
                  ]),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 18),
        const Overline("Frequently Asked"),
        const SizedBox(height: 10),
        ...List.generate(faqs.length, (i) {
          final isOpen = open == i;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: GoogerCard(
              padding: const EdgeInsets.all(14),
              onTap: () => setState(() => open = isOpen ? null : i),
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text(faqs[i].$1, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text))),
                  Icon(isOpen ? Icons.expand_less : Icons.expand_more, size: 17, color: GoogerColors.dim),
                ]),
                if (isOpen)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(faqs[i].$2, style: const TextStyle(fontSize: 11.5, height: 1.5, color: GoogerColors.muted)),
                  ),
              ]),
            ),
          );
        }),
        const SizedBox(height: 14),
        const Overline("Open a Ticket"),
        const SizedBox(height: 10),
        TextField(controller: subject, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "What do you need help with?"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 12),
        TextField(controller: message, onChanged: (_) => setState(() {}), maxLines: 4, decoration: const InputDecoration(hintText: "Describe the issue briefly..."), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: subject.text.isNotEmpty && message.text.isNotEmpty ? () => Navigator.pop(context) : null,
          child: const Text("Submit Ticket"),
        ),
      ]),
    );
  }
}

/* ───────────── Legal pages ───────────── */

class _LegalPage extends StatelessWidget {
  final String title, updated;
  final List<(String, String)> sections;
  const _LegalPage({required this.title, required this.updated, required this.sections});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Overline("Last updated $updated", color: GoogerColors.dim),
        const SizedBox(height: 12),
        ...List.generate(sections.length, (i) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GoogerCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text("${i + 1}. ${sections[i].$1}", style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                const SizedBox(height: 8),
                Text(sections[i].$2, style: const TextStyle(fontSize: 12, height: 1.6, color: GoogerColors.muted)),
              ]),
            ),
          );
        }),
        const Center(child: Text("© 2026 Googer (Pvt) Ltd. All rights reserved.", style: TextStyle(fontSize: 10, color: GoogerColors.dim))),
        const SizedBox(height: 20),
      ]),
    );
  }
}

class TermsScreen extends StatelessWidget {
  const TermsScreen();

  @override
  Widget build(BuildContext context) => const _LegalPage(
        title: "Terms & Conditions",
        updated: "June 2026",
        sections: [
          ("Acceptance of Terms", "By creating a Googer account or using the app you agree to these Terms & Conditions and our Privacy Policy. If you do not agree, please do not use the service."),
          ("Your Account", "You are responsible for keeping your login credentials secure. You must be at least 13 years old to use Googer. One person may hold only one personal account."),
          ("Content & Conduct", "You own the Googs, products and media you post but grant Googer a license to display them within the service. Illegal content, harassment, spam and scam listings are prohibited and lead to suspension."),
          ("Wallet & Rupier Coins", "Rupier coins are an in-app value unit. Top-ups, withdrawals and coin trades are subject to review, processing fees and anti-fraud checks. Wallet-to-wallet payments are final."),
          ("Marketplace", "Sellers are responsible for the accuracy of listings, order fulfilment and applicable taxes. Googer provides escrow for coin trades but is not a party to product sales between users."),
          ("Ads & Monetization", "Ad campaigns are paid in coins and shown according to your budget and audience. Coin rewards collected by viewers are deducted from the campaign budget."),
          ("Suspension & Termination", "We may suspend accounts that breach these terms. Suspended users may retain wallet access where required by law and can appeal within 30 days."),
          ("Changes", "We may update these terms from time to time. Continued use after an update constitutes acceptance of the revised terms."),
        ],
      );
}

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen();

  @override
  Widget build(BuildContext context) => const _LegalPage(
        title: "Privacy Policy",
        updated: "June 2026",
        sections: [
          ("Data We Collect", "Account details (email, username), profile content, transaction records, device information and usage analytics needed to operate the service."),
          ("How We Use Data", "To provide the feed, marketplace, chat and wallet features; to prevent fraud; to personalize content and ads; and to comply with legal obligations."),
          ("Payments & Wallet", "Wallet balances and transaction histories are stored securely. Bank details submitted for withdrawals are used solely for processing payouts."),
          ("Sharing", "We never sell your personal data. Limited data is shared with payment processors, cloud hosting and analytics providers under strict agreements."),
          ("Security", "Passwords are hashed, transport is encrypted, and login alerts, passkeys and two-factor authentication are available to protect your account."),
          ("Your Rights", "You can download your data, correct inaccuracies, deactivate your account or request deletion from Settings → Privacy at any time."),
          ("Contact", "Privacy questions? Reach us via Help & Support or privacy@googer.app."),
        ],
      );
}
