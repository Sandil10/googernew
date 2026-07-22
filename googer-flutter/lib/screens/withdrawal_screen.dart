import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Withdrawal — balance, verification gate, method selection, recent history.
class WithdrawalScreen extends StatefulWidget {
  const WithdrawalScreen({super.key});

  @override
  State<WithdrawalScreen> createState() => _WithdrawalScreenState();
}

class _WithdrawalScreenState extends State<WithdrawalScreen> {
  int _tab = 0;
  static const _tabs = ['My Withdrawal', 'Recent', 'Methods'];

  static const double _balance = 8420.00;
  static const double _limit = 10000;
  static const bool _isVerified = false;

  static const _methods = [
    ['PayPal', 'wallet-outline', true],
    ['Bank Transfer', 'card-outline', false],
    ['USDT', 'logo-usd', false],
    ['Wise', 'cash-outline', true],
  ];

  static const _recent = [
    ['PayPal', '2,500.00', 'Approved', '12 Jun 2026', '1042'],
    ['Bank Transfer', '1,000.00', 'Pending', '10 Jun 2026', '1041'],
    ['Wise', '3,200.00', 'Rejected', '02 Jun 2026', '1038'],
  ];

  @override
  Widget build(BuildContext context) {
    final pct = ((_balance / _limit) * 100).clamp(0, 100).floor();
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Withdrawal', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          Container(
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border1))),
            child: Row(
              children: [
                for (int i = 0; i < _tabs.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _tab = i),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Column(
                          children: [
                            Text(_tabs[i],
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                  color: _tab == i ? Colors.white : AppColors.textGray500,
                                )),
                            const SizedBox(height: 8),
                            Container(height: 2, color: _tab == i ? Colors.white : Colors.transparent),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(child: _tab == 0 ? _withdrawalTab(pct) : _tab == 1 ? _recentTab() : _methodsTab()),
        ],
      ),
    );
  }

  Widget _withdrawalTab(int pct) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
          child: Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('MY TOTAL RUPIER COINS', style: TextStyle(fontSize: 10, color: AppColors.textGray400, letterSpacing: 0.5)),
                    SizedBox(height: 8),
                    Text('8,420.00', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                  ],
                ),
              ),
              Image.asset('assets/images/rupee.png', width: 30, height: 15, fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Text('₹', style: TextStyle(fontSize: 15, color: Colors.white))),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('WITHDRAWAL PROGRESS', style: TextStyle(fontSize: 11, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
            Text('$pct%', style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(9999),
          child: LinearProgressIndicator(value: pct / 100, minHeight: 10, backgroundColor: AppColors.bg1, color: AppColors.successGreen),
        ),
        const SizedBox(height: 18),
        Center(
          child: _isVerified
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: AppColors.successGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(9999), border: Border.all(color: AppColors.successGreen.withOpacity(0.3))),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Ionicons.checkmark_circle, size: 16, color: AppColors.successGreen),
                    SizedBox(width: 6),
                    Text('Identity Verified', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.successGreen)),
                  ]),
                )
              : ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Ionicons.shield_checkmark_outline, size: 16),
                  label: const Text('ID VERIFICATION', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                  ),
                ),
        ),
        const SizedBox(height: 18),
        if (!_isVerified)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x26F59E0B))),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Ionicons.lock_closed_outline, size: 16, color: Color(0xFFFBBF24)),
                SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Withdrawal locked', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFFBBF24))),
                      SizedBox(height: 3),
                      Text('Complete ID Verification to access payment methods.',
                          style: TextStyle(fontSize: 10.5, color: AppColors.textGray500, height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _recentTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final r in _recent) _recentRow(r[0], r[1], r[2], r[3], r[4]),
      ],
    );
  }

  Widget _recentRow(String name, String amount, String status, String date, String id) {
    final color = status == 'Approved'
        ? AppColors.successGreen
        : status == 'Pending'
            ? const Color(0xFFFBBF24)
            : status == 'Rejected'
                ? AppColors.likeRed
                : AppColors.textGray400;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: AppColors.likeRed.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Ionicons.arrow_up_outline, size: 20, color: AppColors.likeRed),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white), overflow: TextOverflow.ellipsis)),
                    Text('- R $amount', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(child: Text('$date · #$id', style: const TextStyle(fontSize: 10, color: AppColors.textGray500))),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: AppColors.bg1, borderRadius: BorderRadius.circular(6)),
                      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _methodsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final m in _methods) _methodRow(m[0] as String, m[1] as String, m[2] as bool),
      ],
    );
  }

  Widget _methodRow(String name, String icon, bool saved) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12)),
            child: Icon(_iconFor(icon), size: 20, color: AppColors.textGray200),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                if (saved)
                  const Text('Details saved', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.successGreen))
                else
                  const Text('No details configured', style: TextStyle(fontSize: 10, color: AppColors.textGray500)),
              ],
            ),
          ),
          const Icon(Ionicons.chevron_forward_outline, size: 16, color: AppColors.textGray500),
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
