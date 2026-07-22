import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// dashboard/admin/subscription -> AdminSubscriptionScreen
/// Manage subscription plans (demo data).
class AdminSubscriptionScreen extends StatelessWidget {
  const AdminSubscriptionScreen({super.key});

  static const _plans = <_Plan>[
    _Plan('Starter', 'starter', 'silver', 100, 30, 5, true,
        ['Verification tick (silver)', 'Save up to 5 Googs', 'Voice calls']),
    _Plan('Pro', 'pro', 'blue', 300, 30, 15, true,
        ['Verification tick (blue)', 'Save up to 15 Googs', 'Voice & video calls', 'Voice to text']),
    _Plan('Elite', 'elite', 'gold', 750, 30, 50, true,
        ['Verification tick (gold)', 'Save up to 50 Googs', 'All calling features', 'Priority support']),
  ];

  Color _badgeColor(String c) {
    switch (c) {
      case 'blue':
        return const Color(0xFF60A5FA);
      case 'gold':
        return const Color(0xFFFBBF24);
      case 'green':
        return AppColors.successGreen;
      case 'purple':
        return AppColors.accentPurple;
      case 'red':
        return AppColors.likeRed;
      default:
        return AppColors.textGray300; // silver
    }
  }

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
        title: const Text('Subscription Plans',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () {},
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Row(
                    children: [
                      Icon(Ionicons.add_outline, size: 16, color: Colors.black),
                      SizedBox(width: 4),
                      Text('Add Plan',
                          style: TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w800, color: Colors.black)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _plans.length,
        separatorBuilder: (_, __) => const SizedBox(height: 16),
        itemBuilder: (_, i) => _planCard(_plans[i]),
      ),
    );
  }

  Widget _planCard(_Plan p) {
    final bc = _badgeColor(p.badgeColor);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bg3,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 5,
            decoration: BoxDecoration(
              color: bc,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: bc.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(9999),
                        border: Border.all(color: bc.withOpacity(0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Ionicons.checkmark_circle, size: 12, color: bc),
                          const SizedBox(width: 4),
                          Text(p.badgeColor.toUpperCase(),
                              style: TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.w800, color: bc)),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text('${p.price}',
                                style: const TextStyle(
                                    fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                            const SizedBox(width: 2),
                            const Text('G',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textGray400)),
                          ],
                        ),
                        Text('${p.days} days',
                            style: const TextStyle(fontSize: 10, color: AppColors.textGray500)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(p.name,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                Text('slug: ${p.slug}',
                    style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _chip(Ionicons.bookmark_outline, '${p.googsLimit} Googs'),
                    _chip(Ionicons.checkmark_circle_outline, 'Verified tick',
                        active: p.verified),
                  ],
                ),
                const SizedBox(height: 12),
                ...p.features.map((f) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Ionicons.checkmark_outline,
                              size: 14, color: AppColors.successGreen),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(f,
                                style: const TextStyle(
                                    fontSize: 12, color: AppColors.textGray300)),
                          ),
                        ],
                      ),
                    )),
                const SizedBox(height: 8),
                const Divider(height: 1, color: AppColors.border1),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _smallBtn('Edit', Ionicons.create_outline, Colors.white)),
                    const SizedBox(width: 8),
                    Expanded(
                        child: _smallBtn('Hide', Ionicons.eye_off_outline, const Color(0xFFFBBF24))),
                    const SizedBox(width: 8),
                    Expanded(
                        child: _smallBtn('Delete', Ionicons.trash_outline, AppColors.likeRed)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label, {bool active = false}) {
    final c = active ? AppColors.successGreen : AppColors.textGray400;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: active ? AppColors.successGreen.withOpacity(0.1) : Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(
            color: active ? AppColors.successGreen.withOpacity(0.3) : AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: c),
          const SizedBox(width: 5),
          Text(label,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c)),
        ],
      ),
    );
  }

  Widget _smallBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Flexible(
            child: Text(label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          ),
        ],
      ),
    );
  }
}

class _Plan {
  final String name;
  final String slug;
  final String badgeColor;
  final int price;
  final int days;
  final int googsLimit;
  final bool verified;
  final List<String> features;
  const _Plan(this.name, this.slug, this.badgeColor, this.price, this.days,
      this.googsLimit, this.verified, this.features);
}
