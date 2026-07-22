import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Sell — list your P2P sell ads and manage buyer transactions.
class SellScreen extends StatefulWidget {
  const SellScreen({super.key});

  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> {
  int _tab = 0;
  static const _tabs = ['Pending', 'Completed', 'Cancelled'];

  static const _ads = [
    ['PayPal', 'wallet-outline', '330.00', 'R 1,000', 'R 45,000'],
    ['USDT (TRC20)', 'logo-usd', '332.00', 'R 2,000', 'R 90,000'],
  ];

  static const _orders = [
    ['#4820100019', 'PayPal', '150.00', '49,500.00', 'pending'],
    ['#4820100018', 'USDT', '80.00', '26,560.00', 'completed'],
    ['#4820100017', 'PayPal', '30.00', '9,900.00', 'cancelled'],
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
        title: const Text('Sell', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Your active payment methods.', style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
          const SizedBox(height: 12),
          for (final a in _ads) _adCard(a),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Ionicons.add_outline, size: 18, color: AppColors.purpleText),
            label: const Text('Create Sell Ad', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.purpleText)),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: const BorderSide(color: AppColors.purpleBorder),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              minimumSize: const Size(double.infinity, 0),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Orders', style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.inputBorder)),
            child: Row(
              children: [
                for (int i = 0; i < _tabs.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _tab = i),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: _tab == i ? AppColors.accentPurple : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_tabs[i],
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: _tab == i ? Colors.white : AppColors.textGray400)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ..._orders.where((o) => o[4] == _tabs[_tab].toLowerCase()).map(_orderCard),
          if (!_orders.any((o) => o[4] == _tabs[_tab].toLowerCase()))
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('No orders in this section', style: TextStyle(fontSize: 12, color: AppColors.textGray600))),
            ),
        ],
      ),
    );
  }

  Widget _adCard(List<String> a) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
            child: Icon(a[1] == 'logo-usd' ? Ionicons.logo_usd : Ionicons.wallet_outline, size: 20, color: AppColors.textGray200),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(a[0], style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text('Limit ${a[3]} – ${a[4]}', style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text('Rate', style: TextStyle(fontSize: 9.5, color: AppColors.textGray500)),
              Text(a[2], style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _orderCard(List<String> o) {
    final status = o[4];
    final color = status == 'completed'
        ? AppColors.successGreen
        : status == 'cancelled'
            ? AppColors.likeRed
            : const Color(0xFFFBBF24);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Order ID ${o[0]}', style: const TextStyle(fontSize: 11, color: AppColors.textGray400, fontFamily: 'monospace'), overflow: TextOverflow.ellipsis)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                child: Text(status[0].toUpperCase() + status.substring(1),
                    style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: color)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _kv('You Pay (Coins)', o[2])),
              Expanded(child: _kv('You Receive (R)', o[3])),
            ],
          ),
          const SizedBox(height: 10),
          Text('Method: ${o[1]}', style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
        ],
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 9.5, color: AppColors.textGray500)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
      ],
    );
  }
}
