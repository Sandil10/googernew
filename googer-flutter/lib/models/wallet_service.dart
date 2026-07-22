import 'package:ionicons/ionicons.dart';
import 'package:flutter/widgets.dart';

class WalletService {
  final IconData icon;
  final String title;
  final String desc;
  final String stat;
  final String label;
  final bool showRupee;

  const WalletService({
    required this.icon,
    required this.title,
    required this.desc,
    required this.stat,
    required this.label,
    required this.showRupee,
  });
}

final List<WalletService> demoServices = [
  WalletService(icon: Ionicons.wallet_outline, title: 'My Wallet', desc: 'Manage your balance and earnings', stat: '12,840.00', label: 'Balance', showRupee: true),
  WalletService(icon: Ionicons.add_circle_outline, title: 'Top Up', desc: 'Recharge your wallet with Rupier coins', stat: 'Topup', label: 'Wallet', showRupee: true),
  WalletService(icon: Ionicons.cash_outline, title: 'Withdrawal', desc: 'Cash out your earnings to your account', stat: '12,840.00', label: 'Available', showRupee: true),
];
