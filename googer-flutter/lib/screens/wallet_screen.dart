import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../widgets/googer_topbar.dart';
import '../widgets/googer_bottom_nav.dart';
import '../models/wallet_service.dart';
import 'my_wallet_screen.dart';
import 'top_up_screen.dart';
import 'withdrawal_screen.dart';
import 'transactions_screen.dart';
import 'sell_screen.dart';

/// 1g · Wallet (Binance/exchange-style compact layout)
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  static void _openService(BuildContext context, String title) {
    final Widget? dest = switch (title.toLowerCase()) {
      'my wallet' => const MyWalletScreen(),
      'top up' => const TopUpScreen(),
      'withdrawal' => const WithdrawalScreen(),
      'sell' => const SellScreen(),
      'transactions' => const TransactionsScreen(),
      _ => null,
    };
    if (dest != null) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => dest));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
      children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('My Googer ID', style: TextStyle(color: AppColors.textGray500, fontSize: 10, fontWeight: FontWeight.w500)),
                      SizedBox(height: 2),
                      Text('GOOG-48201', style: TextStyle(color: AppColors.textGray300, fontSize: 11, fontFamily: 'monospace')),
                    ],
                  ),
                ),
                _squareIconButton(Ionicons.copy_outline),
                const SizedBox(width: 6),
                _squareIconButton(Ionicons.share_social_outline),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: const [
                    Text('Estimated Balance', style: TextStyle(fontSize: 11, color: AppColors.textGray500, fontWeight: FontWeight.w500)),
                    Icon(Ionicons.eye_outline, size: 15, color: AppColors.textGray500),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Image.asset('assets/images/rupee.png', width: 26, height: 13, fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Text('₹', style: TextStyle(fontSize: 16, color: Colors.white))),
                    const SizedBox(width: 8),
                    const Text('12,840.00', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white, letterSpacing: -0.2)),
                    const SizedBox(width: 8),
                    const Padding(
                      padding: EdgeInsets.only(bottom: 4),
                      child: Text('RPR', style: TextStyle(fontSize: 11, color: AppColors.textGray500, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: demoServices.map((s) => _quickAction(context, s)).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Padding(
            padding: EdgeInsets.only(bottom: 10, left: 4, top: 4),
            child: Text('Wallet Details', style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
          ),
          Container(
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: demoServices.map((s) => _detailRow(context, s)).toList(),
            ),
          ),
        ],
      );
  }

  static Widget _squareIconButton(IconData icon) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, size: 14, color: AppColors.textGray300),
    );
  }

  static Widget _quickAction(BuildContext context, WalletService s) {
    return InkWell(
      onTap: () => _openService(context, s.title),
      borderRadius: BorderRadius.circular(10),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle),
            child: Icon(s.icon, size: 18, color: AppColors.textGray200),
          ),
          const SizedBox(height: 6),
          Text(s.title, style: const TextStyle(fontSize: 10, color: AppColors.textGray300, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  static Widget _detailRow(BuildContext context, WalletService s) {
    return InkWell(
      onTap: () => _openService(context, s.title),
      child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.inputBorder))),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle),
            child: Icon(s.icon, size: 16, color: AppColors.textGray400),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                const SizedBox(height: 2),
                Text(s.desc, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500, height: 1.4)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(s.label, style: const TextStyle(fontSize: 10, color: AppColors.textGray500)),
              const SizedBox(height: 2),
              Row(
                children: [
                  if (s.showRupee) Image.asset('assets/images/rupee.png', width: 20, height: 10, fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Text('₹', style: TextStyle(fontSize: 12, color: Colors.white))),
                  const SizedBox(width: 5),
                  Text(s.stat, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                ],
              ),
            ],
          ),
        ],
      ),
      ),
    );
  }
}
