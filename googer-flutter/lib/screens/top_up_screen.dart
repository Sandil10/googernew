import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Top Up (P2P buy) — pick a payment method / seller ad to buy coins.
class TopUpScreen extends StatelessWidget {
  const TopUpScreen({super.key});

  static const _ads = [
    _AdData('PayPal', 'wallet-outline', '330.00', 'R 1,000', 'R 50,000', 'active'),
    _AdData('Bank Transfer', 'card-outline', '325.50', 'R 500', 'R 25,000', 'active'),
    _AdData('USDT (TRC20)', 'logo-usd', '332.00', 'R 2,000', 'R 100,000', 'locked'),
    _AdData('Binance', 'cash-outline', '331.20', 'R 1,500', 'R 80,000', 'active'),
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
        title: const Text('Top Up', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Wallet Balance', style: TextStyle(fontSize: 11, color: AppColors.textGray500, fontWeight: FontWeight.w500)),
                      SizedBox(height: 6),
                      Text('12,840.00', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
                    ],
                  ),
                ),
                Image.asset('assets/images/rupee.png', width: 26, height: 13, fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Text('₹', style: TextStyle(fontSize: 15, color: Colors.white))),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('Available Ads', style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
          ),
          ..._ads.map((a) => _adCard(context, a)),
        ],
      ),
    );
  }

  Widget _adCard(BuildContext context, _AdData a) {
    final locked = a.status == 'locked';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bg3,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
                child: Icon(_iconFor(a.icon), size: 20, color: AppColors.textGray200),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text('Rate ${a.rate}', style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (locked ? AppColors.textGray600 : AppColors.successGreen).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  locked ? 'Locked' : 'Active',
                  style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: locked ? AppColors.textGray400 : AppColors.successGreen),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _limitBox('Min', a.min)),
              const SizedBox(width: 10),
              Expanded(child: _limitBox('Max', a.max)),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: locked ? null : () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                disabledBackgroundColor: AppColors.bg1,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              ),
              child: Text(locked ? 'Unavailable' : 'Buy Now', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _limitBox(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: AppColors.bg2, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.inputBorder)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 9.5, color: AppColors.textGray500)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
        ],
      ),
    );
  }

  IconData _iconFor(String name) {
    switch (name) {
      case 'card-outline':
        return Ionicons.card_outline;
      case 'logo-usd':
        return Ionicons.logo_usd;
      case 'cash-outline':
        return Ionicons.cash_outline;
      default:
        return Ionicons.wallet_outline;
    }
  }
}

class _AdData {
  final String name;
  final String icon;
  final String rate;
  final String min;
  final String max;
  final String status;
  const _AdData(this.name, this.icon, this.rate, this.min, this.max, this.status);
}
