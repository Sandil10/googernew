import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · My Wallet — balance, quick coin send, activity, referrals & rewards.
class MyWalletScreen extends StatelessWidget {
  const MyWalletScreen({super.key});

  static const _activity = [
    ['Ravi Perera', 'Coin Request', '+500.00', true],
    ['Googer Payments', 'Order hold', '-1,200.00', false],
    ['Ad Coin Reward', 'Profile Promote', '+80.00', true],
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
        title: const Text('My Wallet', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.inputBorder)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Total Wallet Balance', style: TextStyle(fontSize: 11, color: AppColors.textGray500, fontWeight: FontWeight.w500)),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Image.asset('assets/images/rupee.png', width: 26, height: 13, fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Text('₹', style: TextStyle(fontSize: 16, color: Colors.white))),
                    const SizedBox(width: 8),
                    const Text('12,840.00', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: const [
                    _QuickAction(Ionicons.arrow_up_outline, 'Send'),
                    _QuickAction(Ionicons.arrow_down_outline, 'Request'),
                    _QuickAction(Ionicons.swap_horizontal_outline, 'Sell'),
                    _QuickAction(Ionicons.time_outline, 'History'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _sectionTitle('Coins Management'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
            child: Column(
              children: [
                TextField(
                  keyboardType: TextInputType.number,
                  style: const TextStyle(fontSize: 13, color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Enter Amount',
                    hintStyle: const TextStyle(fontSize: 13, color: AppColors.textGray600),
                    filled: true,
                    fillColor: AppColors.bg2,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    prefixIcon: const Icon(Ionicons.disc_outline, size: 18, color: AppColors.textGray500),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.inputBorder)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.purpleBorder)),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentPurple,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    ),
                    child: const Text('Manage Coins', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _sectionTitle('Recent Activity'),
          for (final a in _activity) _activityRow(a[0] as String, a[1] as String, a[2] as String, a[3] as bool),
          const SizedBox(height: 20),
          _sectionTitle('My Referral Network'),
          _referralCard(),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 10),
        child: Text(text, style: const TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
      );

  Widget _activityRow(String name, String note, String amount, bool credit) {
    final color = credit ? AppColors.successGreen : AppColors.likeRed;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(credit ? Ionicons.arrow_down_outline : Ionicons.arrow_up_outline, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(note, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(amount, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }

  Widget _referralCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('Total Rewards', style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
              Text('320.00', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.successGreen)),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(height: 1, color: AppColors.inputBorder),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('Total Resell Commission', style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
              Text('145.50', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction(this.icon, this.label);
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle),
          child: Icon(icon, size: 18, color: AppColors.textGray200),
        ),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textGray300, fontWeight: FontWeight.w500)),
      ],
    );
  }
}
