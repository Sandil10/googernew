import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Ad Center — published ads, performance, budget and reach.
class AdCenterScreen extends StatelessWidget {
  const AdCenterScreen({super.key});

  static const _ads = [
    _Ad('Profile Promote', 'active', '2,450', 'R 500', 'R 210', 'R 290', '7 days'),
    _Ad('Summer Sale Campaign', 'active', '1,200', 'R 300', 'R 300', 'R 0', 'Ended'),
    _Ad('New Product Launch', 'paused', '450', 'R 200', 'R 80', 'R 120', '3 days'),
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
        title: const Text('Ad Center', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(child: _summaryCard('Total Impressions', '4,100', Ionicons.eye_outline)),
              const SizedBox(width: 12),
              Expanded(child: _summaryCard('Total Budget', 'R 1,000', Ionicons.wallet_outline)),
            ],
          ),
          const SizedBox(height: 20),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('Published Ads', style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
          ),
          for (final a in _ads) _adCard(a),
          const SizedBox(height: 8),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Ionicons.add_circle_outline, size: 18),
            label: const Text('Create New Ad', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accentPurple,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              minimumSize: const Size(double.infinity, 0),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryCard(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.purpleText),
          const SizedBox(height: 10),
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500), overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  Widget _adCard(_Ad a) {
    final color = a.status == 'active' ? AppColors.successGreen : const Color(0xFFFBBF24);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(a.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                child: Text(a.status[0].toUpperCase() + a.status.substring(1),
                    style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: color)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _stat('Impressions', a.impressions)),
              Expanded(child: _stat('Budget', a.budget)),
              Expanded(child: _stat('Remaining', a.remaining)),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(height: 1, color: AppColors.inputBorder),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(children: [
                const Icon(Ionicons.time_outline, size: 13, color: AppColors.textGray500),
                const SizedBox(width: 4),
                Text(a.duration, style: const TextStyle(fontSize: 11, color: AppColors.textGray400)),
              ]),
              Text('Spend ${a.spend}', style: const TextStyle(fontSize: 11, color: AppColors.textGray400)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 9.5, color: AppColors.textGray500)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
      ],
    );
  }
}

class _Ad {
  final String name;
  final String status;
  final String impressions;
  final String budget;
  final String spend;
  final String remaining;
  final String duration;
  const _Ad(this.name, this.status, this.impressions, this.budget, this.spend, this.remaining, this.duration);
}
