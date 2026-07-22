import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Transactions — full wallet transaction history.
class TransactionsScreen extends StatelessWidget {
  const TransactionsScreen({super.key});

  static const _txns = [
    _Txn('Ravi Perera (ID 48201)', 'Coin Request 500', '+500.00', true, '12 Jun · 14:32'),
    _Txn('Googer Payments', 'Order hold', '-1,200.00', false, '11 Jun · 09:15'),
    _Txn('Nimal Silva (ID 39117)', 'Sell · Send Discount 5%', '+2,375.00', true, '10 Jun · 18:44'),
    _Txn('Googer Commission', 'Commission hold', '-125.00', false, '10 Jun · 18:44'),
    _Txn('Ad Coin Reward', 'Profile Promote', '+80.00', true, '08 Jun · 11:02'),
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
        title: const Text('Transaction History', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [for (final t in _txns) _txnRow(t)],
      ),
    );
  }

  Widget _txnRow(_Txn t) {
    final color = t.credit ? AppColors.successGreen : AppColors.likeRed;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Icon(t.credit ? Ionicons.arrow_down_outline : Ionicons.arrow_up_outline, size: 20, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t.counterparty, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text(t.note, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text(t.time, style: const TextStyle(fontSize: 9.5, color: AppColors.textGray600)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(t.amount, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

class _Txn {
  final String counterparty;
  final String note;
  final String amount;
  final bool credit;
  final String time;
  const _Txn(this.counterparty, this.note, this.amount, this.credit, this.time);
}
