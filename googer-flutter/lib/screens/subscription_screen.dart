import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Subscription — pick a plan and pay from wallet balance.
class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  int _selected = 1;

  static const _plans = [
    _Plan('Silver', '499', Color(0xFFD4D4D8), ['Verified badge', 'Basic chat features', 'Standard support']),
    _Plan('Gold', '999', Color(0xFFFBBF24), ['Gold badge', 'Voice notes to text', 'Priority support', 'Ad discounts']),
    _Plan('Purple', '1,999', AppColors.purpleText, ['Purple badge', 'All chat features', 'Video calls', 'Dedicated support', 'Lifetime history']),
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
        title: const Text('Subscription', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Choose Your Plan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                const SizedBox(height: 4),
                const Text('Pick a subscription that fits you.', style: TextStyle(fontSize: 12, color: AppColors.textGray500)),
                const SizedBox(height: 16),
                for (int i = 0; i < _plans.length; i++) _planCard(i, _plans[i]),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border1))),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Wallet Balance', style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
                    const Text('12,840.00', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total', style: TextStyle(fontSize: 12, color: AppColors.textGray400)),
                    Text('${_plans[_selected].price} coins', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.purpleText)),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentPurple,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    ),
                    child: const Text('Confirm Payment', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _planCard(int i, _Plan p) {
    final selected = i == _selected;
    return GestureDetector(
      onTap: () => setState(() => _selected = i),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.bg3,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? AppColors.accentPurple : AppColors.inputBorder, width: selected ? 1.5 : 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Ionicons.shield_checkmark, size: 18, color: p.color),
                const SizedBox(width: 8),
                Expanded(child: Text(p.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(p.price, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                    const SizedBox(width: 4),
                    const Padding(padding: EdgeInsets.only(bottom: 2), child: Text('coins', style: TextStyle(fontSize: 10, color: AppColors.textGray500))),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (final f in p.features)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    const Icon(Ionicons.checkmark_circle, size: 15, color: AppColors.successGreen),
                    const SizedBox(width: 8),
                    Expanded(child: Text(f, style: const TextStyle(fontSize: 12, color: AppColors.textGray300), overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Plan {
  final String name;
  final String price;
  final Color color;
  final List<String> features;
  const _Plan(this.name, this.price, this.color, this.features);
}
