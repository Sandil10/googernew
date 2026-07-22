import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// wallet-pay · Pay with wallet checkout
class WalletPayScreen extends StatelessWidget {
  const WalletPayScreen({super.key});

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
        title: const Text('Pay with Wallet', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Wallet balance card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.chatBubble, Color(0xFF4C1D95)],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Ionicons.wallet_outline, size: 18, color: Colors.white),
                    SizedBox(width: 8),
                    Text('Wallet Balance',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Image.asset('assets/images/coin.png',
                        width: 22, height: 22, errorBuilder: (_, __, ___) => const Text('🪙', style: TextStyle(fontSize: 15))),
                    const SizedBox(width: 8),
                    const Text('12,480',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
                    const SizedBox(width: 6),
                    const Text('coins',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xCCFFFFFF))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Order Summary',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Column(
              children: [
                _row('Ginger Candy Pack', '120'),
                const Divider(height: 1, color: AppColors.inputBorder),
                _row('Platform fee', '12'),
                const Divider(height: 1, color: AppColors.inputBorder),
                _row('Total', '132', bold: true),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Payment Method',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.purpleBg10,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.purpleBorder),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.purpleBg15,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Ionicons.wallet_outline, size: 18, color: AppColors.purpleText),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Googer Wallet',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                      Text('Balance: 12,480 coins',
                          style: TextStyle(fontSize: 11, color: AppColors.textGray400)),
                    ],
                  ),
                ),
                const Icon(Ionicons.checkmark_circle, size: 20, color: AppColors.accentPurple),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              ),
              child: const Text('Pay 132 coins',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 12),
          const Center(
            child: Text('Secured by Googer Pay',
                style: TextStyle(fontSize: 11, color: AppColors.textGray600)),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String coins, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: bold ? 14 : 13,
                    fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                    color: bold ? Colors.white : AppColors.textGray300)),
          ),
          Image.asset('assets/images/coin.png',
              width: 15, height: 15, errorBuilder: (_, __, ___) => const Text('🪙', style: TextStyle(fontSize: 12))),
          const SizedBox(width: 5),
          Text(coins,
              style: TextStyle(
                  fontSize: bold ? 14 : 13,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  color: Colors.white)),
        ],
      ),
    );
  }
}
